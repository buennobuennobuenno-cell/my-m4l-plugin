"""Execute the shipped GenExpr arithmetic in a checked C++ harness on Linux.

This restricted source-to-source adapter is NOT Cycling '74's Gen compiler.
It retains the actual shipped statements, histories and call-site instances.
Max compilation, its optimizer, GUI and host lifecycle still require native tests.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HISTORY = re.compile(r"\bHistory\s+(\w+)\(([^;]+)\);\s*")
DATA = re.compile(r"\bData\s+(\w+)\((\d+),\s*(\d+)\);\s*")
ASSIGN = re.compile(r"\b([A-Za-z]\w*(?:\s*,\s*[A-Za-z]\w*)*)\s*=(?!=)")


def split_functions(source):
    source = re.sub(r"//[^\n]*", "", source)
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    functions = []
    cursor = 0
    while True:
        match = re.search(r"\b(all_\w+)\(([^)]*)\)\s*\{", source[cursor:])
        if not match:
            break
        start = cursor + match.start()
        opened = cursor + match.end()
        depth, end = 1, opened
        while depth:
            if source[end] == "{": depth += 1
            if source[end] == "}": depth -= 1
            end += 1
        functions.append((match[1], [p.strip() for p in match[2].split(",")], source[opened:end - 1]))
        source = source[:start] + source[end:]
        cursor = start
    return functions, source


def names_assigned(body):
    result = set()
    for match in ASSIGN.finditer(body):
        result.update(name.strip() for name in match[1].split(","))
    return result


def split_top_level(expression):
    depth, start, parts = 0, 0, []
    for i, char in enumerate(expression):
        if char == "(": depth += 1
        elif char == ")": depth -= 1
        elif char == "," and depth == 0:
            parts.append(expression[start:i].strip()); start = i + 1
    parts.append(expression[start:].strip())
    return parts


def statements(body):
    body = re.sub(r"\b([A-Za-z]\w*(?:\s*,\s*[A-Za-z]\w*)+)\s*=\s*([^;]+);",
                  lambda m: "std::tie(" + m[1] + ") = " + m[2] + ";", body)
    body = re.sub(r"\breturn\s+([^;]+);", lambda m:
                  "return std::make_tuple(" + m[1] + ");" if len(split_top_level(m[1])) > 1
                  else "return " + m[1] + ";", body)
    for name in ("min", "max", "clamp", "mod", "abs"):
        body = re.sub(r"\b" + name + r"\(", "g" + name + "(", body)
    return body


def build_header(destination):
    functions, root = split_functions((ROOT / "src/all.genexpr").read_text())
    result = [r'''#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <stdexcept>
#include <tuple>
#include <vector>
using std::floor; using std::exp; using std::log;
inline double gmin(double a,double b){return std::min(a,b);}
inline double gmax(double a,double b){return std::max(a,b);}
inline double gabs(double a){return std::fabs(a);}
inline double gmod(double a,double b){return std::fmod(a,b);}
inline double gclamp(double a,double lo,double hi){return gmin(hi,gmax(lo,a));}
struct AllData {
    size_t frames,channels; std::vector<double> values;
    uint64_t reads=0,writes=0;
    AllData(size_t n,size_t c):frames(n),channels(c),values(n*c,0){}
    size_t index(double frame,double channel){
        if(!std::isfinite(frame)||frame!=floor(frame)||frame<0||frame>=frames||
           !std::isfinite(channel)||channel!=floor(channel)||channel<0||channel>=channels)
            throw std::runtime_error("invalid/noninteger Data address");
        return size_t(frame)*channels+size_t(channel);
    }
};
inline double peek(AllData& d,double f,double c){d.reads++;return d.values[d.index(f,c)];}
inline void poke(AllData& d,double v,double f,double c){d.writes++;d.values[d.index(f,c)]=v;}
''']
    stateful = {}
    for name, params, body in functions:
        histories = HISTORY.findall(body)
        body = HISTORY.sub("", body)
        returns = re.findall(r"\breturn\s+([^;]+);", body)
        assert len(returns) == 1
        arity = len(split_top_level(returns[0]))
        return_type = "double" if arity == 1 else "std::tuple<" + ",".join(["double"] * arity) + ">"
        locals_ = names_assigned(body) - set(params) - {n for n, _ in histories}
        signature = ", ".join("double " + p for p in params)
        declaration = "double " + ",".join(n + "=0" for n in sorted(locals_)) + ";\n"
        if histories:
            cls = "All" + name.removeprefix("all_").title()
            stateful[name] = cls
            result.append("struct " + cls + " {\n")
            result.extend("double " + n + "=" + value + ";\n" for n, value in histories)
            result.append(return_type + " tick(" + signature + ",double samplerate){\n")
            result.append(declaration + statements(body) + "\n}\n};\n")
        else:
            result.append("inline " + return_type + " " + name + "(" + signature + "){\n")
            result.append(declaration + statements(body) + "\n}\n")
    histories = HISTORY.findall(root)
    data = DATA.findall(root)
    root = HISTORY.sub("", DATA.sub("", root))
    members = {n for n, _ in histories} | {n for n, _, _ in data}
    locals_ = names_assigned(root) - members - {"out1", "out2"}
    traces = sorted(locals_)
    result.append("struct AllEngine {\ndouble samplerate,out1=0,out2=0;\n")
    result.extend("double " + n + "=" + value + ";\n" for n, value in histories)
    result.extend("AllData " + n + "{" + frames + "," + channels + "};\n" for n, frames, channels in data)
    for name, cls in stateful.items():
        call = re.compile(r"\b" + name + r"\(([^;()]+)\)")
        count = len(call.findall(root))
        result.extend(cls + " " + name + str(i) + ";\n" for i in range(count))
        index = iter(range(count))
        root = call.sub(lambda m: name + str(next(index)) + ".tick(" + m[1] + ",samplerate)", root)
    result.append("#ifdef ALL_TRACE\nstruct Trace {\n")
    result.extend("double " + n + "=0;\n" for n in traces)
    result.append("} trace;\n#endif\n")
    result.append("explicit AllEngine(double sr):samplerate(sr){}\n")
    result.append("std::array<double,2> tick(double in1,double in2,double in3,double in4){\n")
    result.append("double " + ",".join(n + "=0" for n in sorted(locals_)) + ";\n")
    result.append(statements(root))
    result.append("\n#ifdef ALL_TRACE\n")
    result.extend("trace." + n + "=" + n + ";\n" for n in traces)
    result.append("#endif\nreturn {out1,out2};\n}\n};\n")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("".join(result))
    return destination


if __name__ == "__main__":
    print(build_header(ROOT / "reports/all_model.hpp"))
