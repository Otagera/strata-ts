import { describe, expect, test } from "bun:test";
import { TokenType } from "../shared/interfaces";
import { Lexer } from "./lexer";

describe("SQL Lexer", () => {
	test("Simple SELECT", () => {
		const lexer = new Lexer("SELECT * FROM users");

		expect(lexer.nextToken()).toEqual({
			type: TokenType.Keyword,
			value: "SELECT",
		});
		expect(lexer.nextToken()).toEqual({ type: TokenType.Operator, value: "*" });
		expect(lexer.nextToken()).toEqual({
			type: TokenType.Keyword,
			value: "FROM",
		});
		expect(lexer.nextToken()).toEqual({
			type: TokenType.Identifier,
			value: "users",
		});
		expect(lexer.nextToken()).toEqual({ type: TokenType.EOF, value: "" });
	});

	test("Operators and Numbers", () => {
		const lexer = new Lexer("age >= 18");

		expect(lexer.nextToken()).toEqual({
			type: TokenType.Identifier,
			value: "age",
		});
		expect(lexer.nextToken()).toEqual({
			type: TokenType.Operator,
			value: ">=",
		});
		expect(lexer.nextToken()).toEqual({ type: TokenType.Number, value: "18" });
	});

	test("Strings", () => {
		const lexer = new Lexer("'Hello World'");
		expect(lexer.nextToken()).toEqual({
			type: TokenType.String,
			value: "Hello World",
		});
	});

	test("Complex Query", () => {
		const sql =
			"SELECT name, age FROM users WHERE age >= 18 AND role = 'admin'";
		const lexer = new Lexer(sql);

		const tokens = [];
		let t = lexer.nextToken();
		while (t.type !== TokenType.EOF) {
			tokens.push(t);
			t = lexer.nextToken();
		}

		expect(tokens.length).toBe(14);
		expect(tokens[0]?.value).toBe("SELECT");
		expect(tokens[1]?.value).toBe("name");
		expect(tokens[2]?.value).toBe(",");
		expect(tokens[13]?.value).toBe("admin"); // Last real token
	});

	test("Unterminated String throws Error", () => {
		const lexer = new Lexer("'This string never ends");
		expect(() => lexer.nextToken()).toThrow("Unterminated string literal");
	});

	test("Unexpected Character throws Error", () => {
		const lexer = new Lexer("SELECT * FROM $users"); // $ is invalid
		lexer.nextToken(); // SELECT
		lexer.nextToken(); // *
		lexer.nextToken(); // FROM
		expect(() => lexer.nextToken()).toThrow("Unexpected character: $");
	});
});
