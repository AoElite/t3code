import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";

const openDatabaseAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-sqlite", () => ({ openDatabaseAsync }));
vi.mock("expo-secure-store", () => ({}));

import * as MobileDatabase from "./mobile-database";
import * as MobilePreferences from "./mobile-preferences";
import * as MobileSecureStorage from "./mobile-secure-storage";

describe("offline pull request cache", () => {
  const environmentId = "cached-environment" as import("@t3tools/contracts").EnvironmentId;
  const otherEnvironment = "other-environment" as import("@t3tools/contracts").EnvironmentId;

  async function sqliteDatabase() {
    const { DatabaseSync } = await import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA user_version = 1");
    const database = {
      execAsync: async (sql: string) => {
        sqlite.exec(sql);
      },
      runAsync: async (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).run(...args),
      getFirstAsync: async (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).get(...args),
      getAllAsync: async (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).all(...args),
      withExclusiveTransactionAsync: async (run: (transaction: unknown) => Promise<void>) => {
        await run(database);
      },
      closeAsync: async () => {
        sqlite.close();
      },
    };
    openDatabaseAsync.mockResolvedValueOnce(database);
    return sqlite;
  }

  it.effect("restores saved records and clears them with the environment", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.promise(sqliteDatabase);
        const database = yield* MobileDatabase.make;
        yield* database.saveCache(environmentId, "pull-request", "v1:list", 1, '{"entries":[]}');
        yield* database.saveCache(otherEnvironment, "pull-request", "v1:list", 1, "other");
        expect(yield* database.loadCache(environmentId, "pull-request", "v1:list")).toEqual(
          Option.some('{"entries":[]}'),
        );
        yield* database.clearEnvironmentCache(environmentId);
        expect((yield* database.loadCache(environmentId, "pull-request", "v1:list"))._tag).toBe(
          "None",
        );
        expect((yield* database.loadCache(otherEnvironment, "pull-request", "v1:list"))._tag).toBe(
          "Some",
        );
      }),
    ),
  );

  const secureStorage = Layer.succeed(MobileSecureStorage.MobileSecureStorage, {
    getItem: () => Effect.succeed(null),
    setItem: () => Effect.void,
    removeItem: () => Effect.void,
  });

  describe("mobile thread label preferences", () => {
    it.effect("preserves opt-in and opt-out across reloads and unrelated updates", () =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.promise(sqliteDatabase);
          const database = yield* MobileDatabase.make;
          const store = yield* MobilePreferences.MobilePreferencesStore.pipe(
            Effect.provide(
              MobilePreferences.layer.pipe(
                Layer.provide(
                  Layer.merge(
                    Layer.succeed(MobileDatabase.MobileDatabase, database),
                    secureStorage,
                  ),
                ),
              ),
            ),
          );
          expect(yield* store.load).toEqual({});
          yield* store.savePatch({ showThreadRepositoryAndBranch: true });
          expect(yield* store.load).toEqual({ showThreadRepositoryAndBranch: true });
          yield* store.savePatch({ baseFontSize: 16 });
          expect(yield* store.load).toEqual({
            showThreadRepositoryAndBranch: true,
            baseFontSize: 16,
          });
          yield* store.savePatch({ showThreadRepositoryAndBranch: false });
          expect(yield* store.load).toEqual({
            showThreadRepositoryAndBranch: false,
            baseFontSize: 16,
          });
          yield* database.savePreferencesJson(
            '{"showThreadRepositoryAndBranch":"true","baseFontSize":16}',
            1,
          );
          expect(yield* store.load).toEqual({ baseFontSize: 16 });
        }),
      ),
    );
  });
});
