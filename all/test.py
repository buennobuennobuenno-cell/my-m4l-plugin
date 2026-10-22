"""Run package checks and execute the shipped arithmetic in a native model."""
from pathlib import Path
import argparse
import importlib.util
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("all_native_model", ROOT / "tools/native_model.py")
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def run(args, **kwargs):
    print("+ " + " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), check=True, cwd=ROOT, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sanitize", action="store_true")
    parser.add_argument("--benchmark", action="store_true")
    options = parser.parse_args()
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    model.build_header(reports / "all_model.hpp")
    run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "*_test.py"])
    compiler = os.environ.get("CXX", "g++")
    flags = ["-std=c++17", "-Wall", "-Wextra", "-I", reports]
    name = "render-sanitized" if options.sanitize else "render-test"
    if options.sanitize:
        flags += ["-O1", "-g", "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-fno-pie", "-no-pie"]
    else:
        flags += ["-O2"]
    run([compiler, *flags, ROOT / "tests/render_test.cpp", "-o", reports / name])
    log = reports / (name + ".log")
    with log.open("w") as output:
        run([reports / name], stdout=output)
    print(log.read_text(), end="")
    if options.benchmark:
        target = reports / "benchmark"
        run([compiler, "-std=c++17", "-O3", "-DNDEBUG", "-I", reports,
             ROOT / "tests/benchmark.cpp", "-o", target])
        with (reports / "benchmark.jsonl").open("w") as output:
            run([target], stdout=output)
        for line in (reports / "benchmark.jsonl").read_text().splitlines():
            json.loads(line)
            print(line)


if __name__ == "__main__":
    main()
