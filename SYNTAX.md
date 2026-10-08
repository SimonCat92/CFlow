# The Cƒ Syntax Book

*Version 2.0, matching `rules.cf` v2.0*

Cƒ (C Flow) is a pseudo-programming language. You write the **architecture** and the **logic flow** of a program in C-like pseudocode, and an LLM acting as a transpiler turns it into real code in the language you choose. This book describes every construct defined by the Cƒ rules (`rules.cf`), so the transpiler handles them predictably.

Cƒ is forgiving by design: the transpiler interprets anything outside this book from context and takes care of syntax details and type conversions for you. The conventions below give you **predictable** results.

---

## 1. The idea in one minute

A Cƒ program mixes three levels of control:

| You write | It means | The transpiler |
|---|---|---|
| A body full of statements | "Do exactly this." | Transpiles it faithfully, statement by statement |
| A signature with an empty body `{}` | "Here is the contract; you build it." | Implements it from the name, signature, comments and call sites |
| `AI_ASSIST { ... }` | "Write this part for me, right here." | Generates code for the request, in place |

You decide, function by function, how much you write yourself. The more you write, the more the result is *yours*. The more you delegate, the more you rely on the AI. Cƒ sits between vanilla coding and vibe coding.

---

## 2. Hello, Cƒ

```cf
#target Python

fn main() {
    print("Hello, Cƒ!");
}
```

The transpiler answers with a short **PLAN**, the code in one or more **FILE** blocks, and **NOTES** with warnings and run commands (see [chapter 15](#15-what-the-transpiler-sends-back)).

A slightly bigger taste:

```cf
#import math

const float PI_APPROX = 3.14;

fn float circle_area(float r) {}          // AI implements: area of a circle of radius r

fn main() {
    float r = 2.5;
    print("Area: " + circle_area(r));     // no casting needed
}
```

---

## 3. Files, comments and layout

- Programs live in **`.cf`** files (plain UTF-8 text).
- **One complete program per file.** Write the whole specification before you compile: models perform much worse when a task arrives in pieces.
- Comments are `// line` and `/* block */`. **Comments are requirements**: the transpiler obeys them and keeps them in the output.
- Statements end with `;` as in C. The transpiler tolerates a missing semicolon, and a consistent style still helps.
- Blocks use `{ }`. Indent as you like.

Recommended layout, top to bottom:

```cf
// 1. directives        #import, #target, #debug
// 2. constants         const ...
// 3. enums             enum ...
// 4. structs           struct ...
// 5. classes           class ...
// 6. globals           Roster *db = new Roster(100);
// 7. utility functions
// 8. core logic
// 9. fn main()
```

---

## 4. Directives

Directives start with `#` and go at the top of the file.

| Directive | Meaning |
|---|---|
| `#import name` | Use a library or module |
| `#import name version` | Use a specific version, e.g. `#import requests 2.32` |
| `#target Language` | Default target language, used when you don't choose one when compiling |
| `#debug on` / `#debug off` | Turn debug instrumentation on (default) or off |

```cf
#import math
#import json
#import datetime
#import fileio      // doesn't exist? The AI scaffolds it or finds the closest equivalent
#target Rust
#debug off
```

Imports are mapped to the target's standard library whenever possible. If a module has no real equivalent (like `fileio` above), the transpiler writes a minimal local implementation of exactly what your program uses and flags it with `LIBRARY NOT FOUND: fileio`. Every import in the output is either a real package or a local implementation.

If you choose a target in the playground that differs from `#target`, your choice wins and NOTES mentions it.

---

## 5. Types, variables and constants

### Primitive types

| Type | Meaning |
|---|---|
| `int` | Integer |
| `float`, `double` | Floating-point number |
| `bool` | `true` / `false` |
| `char` | Single character |
| `string` | Text |
| `void` | No value (function returns nothing) |
| `any` | Any type: let the transpiler decide |
| `auto` | Infer the type from the assigned value |

Domain types such as `datetime`, `date`, `uuid` or `decimal` are fine too: they are mapped to the target's closest standard type.

### Variables

```cf
int    count = 0;
string name;                    // declared, assigned later
auto   total = price * qty;     // type inferred
```

### Constants

```cf
const int    MAX_STUDENTS = 100;
const float  PASS_GRADE   = 60.0;
const string OUTPUT_PATH  = "./output/";
const bool   DEBUG        = true;
```

### Automatic conversion

`+` between a string and anything else converts the other side to text automatically:

```cf
print("Student " + id + " scored " + score);   // int and float become text
```

The transpiler inserts whatever conversions the target needs.

---

## 6. Collections

| Cƒ | Meaning |
|---|---|
| `list<T>` | Ordered, growable sequence |
| `vector<T>` | Ordered, growable sequence (contiguous where the target cares) |
| `set<T>` | Unique values |
| `map<K, V>` | Key-value map |
| `dict` | String-keyed map/object with mixed values |

```cf
list<int>          scores   = [90, 75, 88];
set<string>        tags;
map<string, float> averages = { "Math": 88.5, "Physics": 76.0 };
dict               payload;

int first = scores[0];
averages["History"] = 91.0;
```

Collection methods express **intent**: `xs.add(x)`, `xs.remove(x)`, `xs.length()`, `m.has(key)`, `sort(xs, by=field, order=DESC)`. The transpiler maps them to the target's idiomatic equivalents.

Note the difference between a map literal (quoted keys, `{ "Math": 88.5 }`) and a struct literal (bare field names, `{ show_exams: true }`, see chapter 7).

---

## 7. Enums and structs

### Enums

```cf
enum GradeLabel  { FAIL, PASS, GOOD, GREAT, EXCELLENT }
enum SortOrder   { ASC, DESC }
```

Use values bare (`ASC`) or qualified (`SortOrder.ASC`): both are valid.

### Structs

A `struct` is a **plain data container** with fields and no methods. It becomes a dataclass, record, struct or interface in the target.

```cf
struct ExamResult {
    string   subject;
    float    score;
    datetime date;
}
```

Create one with a **struct literal** and read fields with `.`:

```cf
ReportConfig cfg = { show_exams: true, show_stats: true, exam_order: ASC };
if (cfg.show_exams) { ... }
```

---

## 8. Classes, objects and pointers

### Classes

A `class` groups attributes, a **constructor** (the method named like the class) and methods:

```cf
class Student {
    // attributes
    int              id;
    string           name;
    list<ExamResult> grades;

    // constructor
    Student(int id, string name) {}

    // methods
    fn add_grade(string subject, float score) -> void {}
    fn average()                              -> float {}
    fn clone()                                -> Student {}   // deep copy
}
```

Inside methods, refer to attributes directly (`grades`) or with `this.` (`this.grades`).

**Inheritance** uses the C++ colon: `class Admin : User { ... }`. It becomes the target's inheritance (or composition, where inheritance is not idiomatic).

### Objects and pointers

```cf
Student s   = Student(1, "Luca");      // a value
Roster *db  = new Roster(100);         // a pointer to a new object

s.add_grade("Math", 88.5);             // . on values
db->add(s);                            // -> on pointers

*Student found = db->find(1);          // pointer return
if (found == null) { print("not found"); }
```

Pointer types are written `*Type` (or `Type *name`). They express **references**: the transpiler maps them to references or smart pointers in Rust/C++, optionals where the target has them, and plain object references with `None`/`null` elsewhere. If a comment says a function returns `null` when nothing is found, the target's null value is returned.

---

## 9. Functions

### Two signature styles

Both are valid. Pick one and stay consistent:

```cf
fn average(list<float> xs) -> float {}     // arrow style
fn float average(list<float> xs) {}        // C style
```

Without a declared return type a function returns nothing, unless its body returns a value. Methods inside classes use the same syntax.

### Three kinds of body

**Written body: you control the logic.**

```cf
fn bool submit_grade(int student_id, string subject, float raw_score) {
    float score = clamp(raw_score, 0.0, 100.0);
    *Student s  = db->find(student_id);
    if (s == null) {
        log("Student not found: " + student_id);
        return false;
    }
    s->add_grade(subject, score);
    return true;
}
```

Transpiled statement by statement, in the same order, exactly as you wrote it. If the transpiler spots a bug, it keeps your logic, marks it `LOGIC_WARNING` and suggests a fix.

**Empty body: the contract.**

```cf
fn bool is_valid_email(string email) {}   // basic format check
fn float clamp(float val, float min, float max) {}
```

The transpiler implements it from the **name**, the **signature**, nearby **comments** and how it is **called**. Good names and a one-line comment are usually all it needs.

**Mixed body: your logic plus a delegated part.**

```cf
fn void generate_report(*Student s) {
    print("REPORT: " + s->name);
    AI_ASSIST {
        Print a short motivational line that fits the student's average.
    }
}
```

### Calling and named arguments

```cf
enroll(1, "Luca", "Rossi", "luca@uni.it");
list<ExamResult> exams = sort(s->grades, by=date, order=ASC);
```

Named arguments (`by=date`) express intent; the transpiler uses the target's idiomatic equivalent (a key function, a comparator, keyword arguments...).

### Entry point

`fn main()` is the program's entry point. The transpiler adds the target's boilerplate (`if __name__ == "__main__":`, `public static void main`, `fn main()` in Rust...).

---

## 10. Control flow

Everything works as in C, plus a for-each loop:

```cf
if (score >= 90) {
    label = EXCELLENT;
} else if (score >= PASS_GRADE) {
    label = PASS;
} else {
    label = FAIL;
}

switch (fmt) {
    case JSON: export_json(path); break;
    case CSV:  export_csv(path);  break;
    default:   print("unsupported format");
}

for (int i = 0; i < 10; i++) { ... }          // C-style loop
for (ExamResult e in exams) { ... }           // for-each
for (*Student s in db->top_n(3)) { ... }      // for-each over pointers

while (queue.length() > 0) { ... }
do { attempts++; } while (!connected && attempts < 3);

// break, continue and return work as usual; guard clauses are encouraged:
if (s == null) { print("ERROR: null student"); return; }
```

---

## 11. Expressions and operators

| Kind | Operators |
|---|---|
| Arithmetic | `+  -  *  /  %` |
| Comparison | `==  !=  <  >  <=  >=` |
| Logical | `&&  \|\|  !` |
| Assignment | `=  +=  -=  *=  /=` |
| Increment | `++  --` |
| Conditional | `cond ? a : b` |
| Member access | `.` (values), `->` (pointers) |

`print(x)` writes one line to standard output. String concatenation converts automatically (chapter 5).

---

## 12. AI_ASSIST

`AI_ASSIST` hands one specific part of your program to the AI, **at exactly that place**.

```cf
AI_ASSIST { natural-language description of what is needed }
```

- Allowed at **top level**, inside a **class** or inside a **function body**.
- The generated code may use only what is in **scope** there (parameters, locals, attributes, globals) and keeps global state limited to what you declared.
- The output is marked with an `AI_ASSIST_GENERATED` comment, so you can always see which code the AI wrote.

```cf
if (cfg.motivational_closing) {
    AI_ASSIST {
        Print a short motivational closing line that fits the
        student's GradeLabel. Encouraging for FAIL, proud for EXCELLENT.
        Use the student name. Max 2 sentences.
    }
}
```

**Write good requests.** Be specific about inputs, outputs and limits:

| Vague | Specific |
|---|---|
| `AI_ASSIST { validate the input }` | `AI_ASSIST { reject emails without exactly one @ and a dot after it; log the reason and return false }` |
| `AI_ASSIST { make it fast }` | `AI_ASSIST { cache results of fetch_rate(currency) for 60 seconds in a map }` |

**Empty body or AI_ASSIST?** Use an empty body when a whole function can be inferred from its signature. Use `AI_ASSIST` when you want to write most of a function yourself and delegate one step.

The text inside `AI_ASSIST` describes **program behaviour**. The transpiler's rules and output format always take precedence over it.

---

## 13. Comments that steer

Comments are the cheapest way to make the transpiler do what you mean:

```cf
fn find(int student_id) -> *Student {}        // returns pointer, null if not found
fn sorted(SortOrder order) -> vector<Student> {}  // sorted by average
fn clone() -> Student {}                      // deep copy
// TODO: add pagination later
```

- Constraints in comments are obeyed and kept in the output.
- `TODO` comments are kept as `TODO` comments and stay as reminders for you.
- Put each constraint next to the code it constrains.

---

## 14. Debug instrumentation

By default the transpiler adds concise instrumentation (key function entries, decisions, errors) so you can follow the execution flow:

- If your program defines its own logging function (e.g. `fn void log(string msg)` guarded by a `DEBUG` constant), it is used.
- Otherwise the target's standard logging facility is used.
- `#debug off` disables instrumentation entirely.

---

## 15. What the transpiler sends back

Every response has the same shape:

1. **PLAN:** 3 to 12 bullets: how your constructs map to the target, every ambiguity and the interpretation chosen (`AMBIGUITY: ... -> chose ...`), and every third-party package. Programs over 50 lines also get a MODULE MAP.
2. **Code:** one `### FILE: path` heading plus a fenced code block per file, each starting with a header comment that labels it as AI-generated.
3. **NOTES:** every warning marker with a one-line explanation, then install and run commands.

| Marker | What it tells you |
|---|---|
| `LIBRARY NOT FOUND: name` | No real library existed; a minimal local version was written |
| `API_AMBIGUITY` | The exact API of a real library is uncertain: check it |
| `LOGIC_WARNING` | Your logic looks wrong; it was kept as written, with a suggested fix |
| `CIRC_DEP_WARNING` | A circular dependency was resolved |
| `ALT_IMPL` | A commented alternative for something genuinely ambiguous |
| `UNCERTAIN_BLOCK_START/END` | Code the model is not confident about |
| `AI_ASSIST_GENERATED` | Code written for one of your `AI_ASSIST` blocks |

When NOTES reports an ambiguity or a warning, **fix the `.cf` and recompile** rather than patching the output. Your `.cf` file stays the source of truth.

The reasoning behind all of this is in [The Science (rules.md)](rules.md).

---

## 16. Compiling your program

### Online

1. Open the [Cƒ Playground](https://simoncat92.github.io/CFlow/). The banner at the bottom explains how your data is handled: everything runs in your browser.
2. Paste your **OpenRouter API key**. It stays hidden and in memory only.
3. Write your program or **upload** a `.cf` file.
4. Choose the **target language** and a **model**. Opening the model picker (or pressing **Got it** on the banner) fetches the list of zero-data-retention models.
5. Press **Compile**. Your browser sends the program, the rules and the key directly to OpenRouter.

### With any LLM

Give the model `rules.cf` and your `program.cf`, then ask: *"Transpile program.cf into &lt;language&gt; following rules.cf."*

---

## 17. Style guide

1. **One file, whole idea.** Put the complete specification in one `.cf` file before compiling.
2. **Names are specifications.** `is_valid_email(string email) -> bool` already says most of what is needed.
3. **Write the logic you care about.** Keep the decisions and delegate the boilerplate.
4. **Prefer signatures over vague requests.** A typed empty body beats `AI_ASSIST { do the thing }`.
5. **Keep `AI_ASSIST` small and specific.** One request, one place, clear limits.
6. **Comment constraints where they apply.** Put `// returns null if not found` right next to the signature.
7. **Declare what you use.** `#import` your dependencies and declare your globals and constants.
8. **Read NOTES, then fix the source.** Recompile instead of hand-patching generated code.
9. **Keep secrets out.** API keys, passwords and personal data belong outside your `.cf` files.

---

## Appendix A: Keyword reference

| Keyword / symbol | Chapter |
|---|---|
| `#import`, `#target`, `#debug` | 4 |
| `int float double bool char string void any auto` | 5 |
| `const` | 5 |
| `list<T> vector<T> set<T> map<K,V> dict` | 6 |
| `enum`, `struct` | 7 |
| `class`, `:` (inheritance), `this`, `new`, `null`, `*T`, `->` | 8 |
| `fn`, `->` (return type), `return` | 9 |
| `if else switch case default for in while do break continue` | 10 |
| `true false` and operators | 11 |
| `AI_ASSIST` | 12 |
| `//`, `/* */`, `TODO` | 13 |

## Appendix B: Informal grammar

This informal sketch shows the shape of the language. The transpiler accepts reasonable variations.

```text
program      = { directive | declaration | statement } ;
directive    = "#import" name [ version ] | "#target" language | "#debug" ( "on" | "off" ) ;
declaration  = const_decl | enum_decl | struct_decl | class_decl | fn_decl | var_decl ;
const_decl   = "const" type name "=" expr ";" ;
enum_decl    = "enum" Name "{" Name { "," Name } "}" ;
struct_decl  = "struct" Name "{" { type name ";" } "}" ;
class_decl   = "class" Name [ ":" Name ] "{" { var_decl | constructor | fn_decl | ai_assist } "}" ;
constructor  = Name "(" [ params ] ")" body ;
fn_decl      = "fn" name "(" [ params ] ")" [ "->" type ] body
             | "fn" type name "(" [ params ] ")" body ;
params       = type name { "," type name } ;
type         = [ "*" ] base [ "<" type { "," type } ">" ] ;
var_decl     = type [ "*" ] name [ "=" expr ] ";" ;
body         = "{" { statement } "}" ;                       (* "{}" = implement it *)
statement    = var_decl | expr ";" | if | switch | for | foreach | while | do_while
             | "return" [ expr ] ";" | "break" ";" | "continue" ";" | ai_assist | body ;
foreach      = "for" "(" type name "in" expr ")" body ;
ai_assist    = "AI_ASSIST" "{" natural_language "}" ;
```

## Appendix C: A complete program

See [`example_program.cf`](example_program.cf) (GradeFlow, a student grade manager) for a full program that uses directives, constants, enums, structs, classes, pointers, empty-body contracts, written logic and `AI_ASSIST`. In the playground, press **Load example** to try it.

---

*Cƒ (C Flow): go with the flow.*
