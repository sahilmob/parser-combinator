import {
  str,
  letters,
  digits,
  sequenceOf,
  choice,
  many,
  many1,
  sepBy,
  sepBy1,
  between,
  lazy,
  evaluate,
  contextual,
} from ".";

describe("Parser combinator", () => {
  it("should parse strings", () => {
    const parser = str("hello world");

    expect(parser.run("hello world").result).toBe("hello world");
  });

  it("should parse letters", () => {
    const parser = letters;

    expect(parser.run("hello").result).toBe("hello");
  });

  it("should parse digits", () => {
    const parser = digits;

    expect(parser.run("123456").result).toBe("123456");
  });

  it("should parse sequence", () => {
    const parser1 = sequenceOf([letters, digits, letters]);
    const parser2 = sequenceOf([digits, letters, digits]);

    expect(parser1.run("abc123def").result).toEqual(["abc", "123", "def"]);
    expect(parser2.run("123abc456").result).toEqual(["123", "abc", "456"]);
  });

  it("should parse a choice", () => {
    const parser = choice([digits, letters, str("def")]);

    expect(parser.run("123").result).toBe("123");
    expect(parser.run("aaa").result).toBe("aaa");
    expect(parser.run("def").result).toBe("def");
  });

  it("should parse many strings", () => {
    const parser = many(str("abc"));

    expect(parser.run("abcabcabc").result).toEqual(["abc", "abc", "abc"]);
  });

  it("should parse at least 1 string or return an error", () => {
    const parser = many1(str("abc"));

    expect(parser.run("abcabcabc").result).toEqual(["abc", "abc", "abc"]);
    expect(parser.run("defdefdef").isError).toBe(true);
  });

  it("should parse comma separated strings", () => {
    const separatorParser = sepBy(str(","));
    const stringParser = str("abc");
    const parser = separatorParser(stringParser);

    expect(parser.run("abc,abc,abc").result).toEqual(["abc", "abc", "abc"]);
  });

  it("should parse at least 2 comma separated strings or return an error", () => {
    const separatorParser = sepBy1(str(","));
    const stringParser = str("abc");
    const parser = separatorParser(stringParser);

    expect(parser.run("def,def,def").isError).toBe(true);
  });

  it("should parse values between brackets", () => {
    const separatorParser = between(str("("), str(")"));
    const stringParser = str("abc");
    const parser = separatorParser(stringParser);

    expect(parser.run("(abc)").result).toEqual(["abc"]);
  });

  it("should parse nested expressions and evaluate the AST", () => {
    const numberParser = digits.map((value) => ({
      value: Number(value),
      type: "number",
    }));
    const operatorParser = choice([str("+"), str("-"), str("*"), str("/")]);
    const betweenBracketsParser = between(str("("), str(")"));
    const expr = lazy(() => choice([numberParser, operationParser]));
    const operationParser = betweenBracketsParser(
      sequenceOf([operatorParser, many1(str(" ")), expr, many1(str(" ")), expr])
    ).map((result) => ({
      type: "operation",
      value: {
        op: result[0],
        a: result[2],
        b: result[4],
      },
    }));
    const program = "(+ (* 10 2) (- (/ 50 3) 2))";

    const { result } = operationParser.run(program);

    expect(result).toEqual({
      type: "operation",
      value: {
        op: "+",
        a: {
          type: "operation",
          value: {
            op: "*",
            a: {
              value: 10,
              type: "number",
            },
            b: {
              value: 2,
              type: "number",
            },
          },
        },
        b: {
          type: "operation",
          value: {
            op: "-",
            a: {
              type: "operation",
              value: {
                op: "/",
                a: {
                  value: 50,
                  type: "number",
                },
                b: {
                  value: 3,
                  type: "number",
                },
              },
            },
            b: {
              value: 2,
              type: "number",
            },
          },
        },
      },
    });
    expect(evaluate(result)).toBe(34.66666666666667);
  });

  it("should parse expressions contextually", () => {
    const example1 = `VAR theAnswer INT 42`;
    const example2 = `GLOBAL_VAR greeting STRING "Hello"`;
    const example3 = `VAR skyIsBlue BOOL true`;

    const varDeclarationParser = contextual(function* () {
      const declarationType = yield choice([str("VAR "), str("GLOBAL_VAR ")]);

      const varName = yield letters;
      const type = yield choice([str(" INT "), str(" STRING "), str(" BOOL ")]);

      let data;
      if (type === " INT ") {
        data = yield digits;
      } else if (type === " STRING ") {
        data = yield sequenceOf([str('"'), letters, str('"')]).map(
          (data) => data[1]
        );
      } else if (type === " BOOL ") {
        data = yield choice([str("true"), str("false")]);
      }

      return {
        varName,
        data,
        type,
        declarationType,
      };
    });

    expect(varDeclarationParser.run(example1).result).toEqual({
      data: "42",
      declarationType: "VAR ",
      type: " INT ",
      varName: "theAnswer",
    });
    expect(varDeclarationParser.run(example2).result).toEqual({
      data: "Hello",
      declarationType: "GLOBAL_VAR ",
      type: " STRING ",
      varName: "greeting",
    });
    expect(varDeclarationParser.run(example3).result).toEqual({
      data: "true",
      declarationType: "VAR ",
      type: " BOOL ",
      varName: "skyIsBlue",
    });
  });
});
