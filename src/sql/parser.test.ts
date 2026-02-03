import { describe, expect, test } from "bun:test";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { NodeType, type SelectStatement, type BinaryExpression, type Literal } from "../shared/interfaces";

describe("SQL Parser", () => {
	test("Parses SELECT * FROM users", () => {
		const lexer = new Lexer("SELECT * FROM users");
		const parser = new Parser(lexer);
		const ast = parser.parse() as SelectStatement;

		expect(ast.type).toBe(NodeType.SelectStatement);
		expect(ast.table).toBe("users");
		expect(ast.columns).toEqual(["*"]);
		expect(ast.where).toBeUndefined();
	});

	test("Parses SELECT name, age FROM users", () => {
		const lexer = new Lexer("SELECT name, age FROM users");
		const parser = new Parser(lexer);
		const ast = parser.parse() as SelectStatement;

		expect(ast.columns).toEqual(["name", "age"]);
	});

	test("Parses WHERE clause (Comparison)", () => {
		const lexer = new Lexer("SELECT * FROM users WHERE age > 18");
		const parser = new Parser(lexer);
		const ast = parser.parse() as SelectStatement;

		expect(ast.where).toBeDefined();
		const where = ast.where as BinaryExpression;
		expect(where.type).toBe(NodeType.BinaryExpression);
		expect(where.operator).toBe(">");
		// Left side should be Identifier 'age'
		expect(where.left.type).toBe(NodeType.Identifier);
		// Right side should be Literal 18
		expect((where.right as Literal).value).toBe(18);
	});

	test("Parses Complex WHERE (AND)", () => {
		const lexer = new Lexer("SELECT * FROM users WHERE age > 18 AND role = 'admin'");
		const parser = new Parser(lexer);
		const ast = parser.parse() as SelectStatement;

		const where = ast.where as BinaryExpression;
		expect(where.operator).toBe("AND");
		
		// Check Left (age > 18)
		const left = where.left as BinaryExpression;
		expect(left.operator).toBe(">");

		// Check Right (role = 'admin')
		const right = where.right as BinaryExpression;
		expect(right.operator).toBe("=");
		expect((right.right as Literal).value).toBe("admin");
	});
});
