import * as NodeOS from "node:os";
import { assert, it } from "vite-plus/test";
import { DESKTOP_WSL_BACKEND_ENVIRONMENT_MARKER } from "@t3tools/shared/wslEnvironment";

import { hydratePosixEnvironment, hydratePosixHome } from "./os-jank.ts";

it("hydrates HOME for minimal service environments from the user account", () => {
  const env: NodeJS.ProcessEnv = {};

  hydratePosixHome(env);

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("hydrates HOME independently of a blank process HOME", () => {
  const originalHome = process.env.HOME;
  const env: NodeJS.ProcessEnv = { HOME: " " };

  try {
    process.env.HOME = " ";
    hydratePosixHome(env);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("preserves an explicitly configured HOME", () => {
  const env: NodeJS.ProcessEnv = { HOME: "/custom/home" };

  hydratePosixHome(env, () => {
    throw new Error("HOME lookup should not run");
  });

  assert.equal(env.HOME, "/custom/home");
});

it("prefers WSL login values while preserving Windows fallbacks", () => {
  const env: NodeJS.ProcessEnv = {
    WSL_DISTRO_NAME: "Ubuntu",
    [DESKTOP_WSL_BACKEND_ENVIRONMENT_MARKER]: "1",
    PATH: "/windows/path",
    OPENAI_API_KEY: "windows-openai-key",
    GH_TOKEN: "windows-gh-token",
    T3CODE_LOG_LEVEL: "Info",
  };
  let requestedNames: ReadonlyArray<string> = [];

  hydratePosixEnvironment(
    env,
    "linux",
    (_shell, names) => {
      requestedNames = names;
      return {
        PATH: "/wsl/path",
        OPENAI_API_KEY: "wsl-openai-key",
        T3CODE_LOG_LEVEL: "",
      };
    },
    () => {
      throw new Error("launchctl should not be read on Linux");
    },
  );

  assert.includeMembers(
    [...requestedNames],
    ["PATH", "OPENAI_API_KEY", "GH_TOKEN", "T3CODE_LOG_LEVEL"],
  );
  assert.equal(env.PATH, "/wsl/path:/windows/path");
  assert.equal(env.OPENAI_API_KEY, "wsl-openai-key");
  assert.equal(env.T3CODE_LOG_LEVEL, "");
  assert.equal(env.GH_TOKEN, "windows-gh-token");
  assert.notProperty(env, DESKTOP_WSL_BACKEND_ENVIRONMENT_MARKER);
});

it("does not hydrate portable configuration outside a desktop-managed WSL backend", () => {
  const env: NodeJS.ProcessEnv = {
    WSL_DISTRO_NAME: "Ubuntu",
    PATH: "/inherited/path",
    OPENAI_API_KEY: "inherited-key",
  };
  let requestedNames: ReadonlyArray<string> = [];

  hydratePosixEnvironment(env, "linux", (_shell, names) => {
    requestedNames = names;
    return { PATH: "/login/path", OPENAI_API_KEY: "login-key" };
  });

  assert.deepEqual(requestedNames, ["PATH"]);
  assert.equal(env.PATH, "/login/path:/inherited/path");
  assert.equal(env.OPENAI_API_KEY, "inherited-key");
});
