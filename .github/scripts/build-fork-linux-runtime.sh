#!/usr/bin/env bash
set -euo pipefail

version=${1:?Pass the fork runtime version}
[[ "$version" =~ ^0\.1\.14-aoelite\.([1-9][0-9]*|test\.g[0-9a-f]{8})$ ]]
[[ "$(uname -s)-$(uname -m)" == Linux-x86_64 ]]

base=0.1.13
stock_name="t3-$base-linux-x64"
fork_name="t3-$version-linux-x64"
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
output="$PWD/release-fork-runtime"
mkdir -p -- "$output"

# This fork patch only changes the server. Keep the exact upstream client and native modules.
curl --fail --location --silent --show-error --retry 3 \
  "https://github.com/pingdotgg/t3code/releases/download/v$base/$stock_name.tar.gz" \
  -o "$scratch/$stock_name.tar.gz"
curl --fail --location --silent --show-error --retry 3 \
  "https://github.com/pingdotgg/t3code/releases/download/v$base/SHA256SUMS" \
  -o "$scratch/upstream-SHA256SUMS"
(
  cd "$scratch"
  awk -v artifact="$stock_name.tar.gz" '$2 == artifact { print }' upstream-SHA256SUMS | sha256sum -c
  tar -xzf "$stock_name.tar.gz"
)

APP_VERSION="$version" node apps/server/scripts/cli.ts build-exe --verbose
stage="$scratch/$stock_name"
mv -- "$stage/t3" "$stage/t3-stock"
install -m 755 apps/server/dist-exe/t3 "$stage/t3"
patchelf --set-rpath "\$ORIGIN/lib" "$stage/t3"
[[ "$("$stage/t3" --version)" == "t3 v$version" ]]

vp test run apps/server/src/vcs/VcsStatusBroadcaster.test.ts -t 'publishes fresh Git counts'

python3 - "$stage" "$base" "$version" <<'PY'
import json
import pathlib
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request

stage = pathlib.Path(sys.argv[1])
stock_version, fork_version = sys.argv[2:]
with tempfile.TemporaryDirectory(prefix="t3-fork-smoke-") as directory:
    root = pathlib.Path(directory)
    data = root / "data"
    project = root / "project"
    project.mkdir()
    subprocess.run(["git", "init", "--quiet", str(project)], check=True)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"

    def boot(executable, version, seed=False):
        binary = str(stage / executable)
        with tempfile.TemporaryFile(mode="w+") as log:
            process = subprocess.Popen(
                [binary, "serve", "--base-dir", str(data), "--host", "127.0.0.1", "--port", str(port)],
                cwd=project, stdout=log, stderr=subprocess.STDOUT,
            )
            try:
                for _ in range(45):
                    if process.poll() is not None:
                        raise RuntimeError(f"{executable} exited before readiness")
                    try:
                        with urllib.request.urlopen(origin + "/.well-known/t3/environment", timeout=2) as response:
                            environment = json.load(response)
                        break
                    except OSError:
                        time.sleep(1)
                else:
                    raise RuntimeError(f"{executable} did not become ready")
                assert environment["serverVersion"] == version
                if seed:
                    subprocess.run(
                        [binary, "project", "add", str(project), "--base-dir", str(data)],
                        check=True, timeout=30, stdout=log, stderr=subprocess.STDOUT,
                    )
                with urllib.request.urlopen(origin + "/", timeout=5) as response:
                    assert response.status == 200
                with sqlite3.connect(f"file:{data}/userdata/statev2.sqlite?mode=ro", uri=True) as db:
                    assert db.execute("PRAGMA quick_check").fetchone() == ("ok",)
                    projects = db.execute("SELECT * FROM projection_projects").fetchall()
                    assert len(projects) == 1
                    return (environment["environmentId"], environment["databaseMigration"], projects)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

    before = boot("t3-stock", stock_version, seed=True)
    preflight = json.loads(subprocess.check_output([
        str(stage / "t3"), "__service-preflight",
        "--database-path", str(data / "userdata/statev2.sqlite"),
        "--launcher-protocol", "4",
    ], timeout=30))
    assert preflight == {"status": "ready", "version": fork_version, "launcherProtocol": 4}, preflight
    assert boot("t3", fork_version) == before, "Upgrade altered the environment or project data"
    assert boot("t3-stock", stock_version) == before, "Rollback altered the environment or project data"
    print("Managed-update preflight passed; upgrade and rollback preserved environment and project data.")
PY

rm -- "$stage/t3-stock"
mv -- "$stage" "$scratch/$fork_name"
tar --hard-dereference -czf "$output/$fork_name.tar.gz" -C "$scratch" "$fork_name"
(cd "$output" && sha256sum "$fork_name.tar.gz" > SHA256SUMS)
