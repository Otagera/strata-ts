import { StrataDoc } from "../doc/engine";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import {
	NodeType,
	type ASTNode,
	type SelectStatement,
	type BinaryExpression,
	type Literal,
	type Identifier,
	type CreateTableStatement,
	type InsertStatement,
} from "../shared/interfaces";
import { SystemCatalog } from "./catalog";

export class StrataSQL {
	private docEngine: StrataDoc;
	private systemCatalog: SystemCatalog;

	constructor(docEngine: StrataDoc) {
		this.docEngine = docEngine;
		this.systemCatalog = new SystemCatalog(docEngine);
	}

	public execute = async (sql: string): Promise<any[]> => {
		// 1. Parse
		const lexer = new Lexer(sql);
		const parser = new Parser(lexer);
		const ast = parser.parse();

		// 2. Dispatch based on Statement Type
		switch (ast.type) {
			case NodeType.SelectStatement:
				return this.executeSelect(ast as SelectStatement);
			case NodeType.InsertStatement:
				await this.executeInsert(ast as InsertStatement);
				return [];
			case NodeType.CreateTableStatement:
				await this.executeCreateTable(ast as CreateTableStatement);
				return [];
			default:
				throw new Error(`Unsupported statement type: ${ast.type}`);
		}
	};

	private executeSelect = async (ast: SelectStatement): Promise<any[]> => {
		const collection = ast.table;
		const query = this.translateWhere(ast.where);

		// TODO: Handle 'columns' projection (SELECT name vs SELECT *)
		// For now, we fetch everything and allow the user to filter,
		// or we can add projection to StrataDoc later.
		const schema = await this.systemCatalog.getTable(collection);
		if (schema === null) {
			throw new Error(`Table '${collection}' does not exist`);
		}
		for (const column of ast.columns) {
			if (column !== "*") {
				const columnExists = schema.columns.some((col) => col.name === column);
				if (!columnExists) {
					throw new Error(
						`Column '${column}' does not exist in table '${collection}'`
					);
				}
			} else {
				break;
			}
		}

		const cursor = this.docEngine.find(collection, query);
		return await cursor.toArray();
	};

	private executeInsert = async (ast: InsertStatement): Promise<void> => {
		const collection = ast.table;
		const schema = await this.systemCatalog.getTable(collection);
		if (schema === null) {
			throw new Error(`Table '${collection}' does not exist`);
		}

		// Check for extra columns
		const validColumns = new Set(schema.columns.map((c) => c.name));
		for (const key of Object.keys(ast.values)) {
			if (!validColumns.has(key)) {
				throw new Error(
					`Column '${key}' does not exist in table '${collection}'`
				);
			}
		}

		for (const column of schema.columns) {
			const key = column.name;
			const value = ast.values[key];
			const exists = value !== undefined;
			if (!exists) {
				throw new Error(
					`Missing value for column '${column.name}' in table '${collection}'`
				);
			}
			switch (column.dataType) {
				case "INT":
					if (typeof value !== "number" || !Number.isInteger(value)) {
						throw new Error(
							`Invalid type for column '${column.name}': expected INT`
						);
					}
					break;
				case "TEXT":
					if (typeof value !== "string") {
						throw new Error(
							`Invalid type for column '${column.name}': expected TEXT`
						);
					}
					break;
				case "BOOL":
					if (typeof value !== "boolean") {
						throw new Error(
							`Invalid type for column '${column.name}': expected BOOL`
						);
					}
					break;
				default:
					throw new Error(
						`Unsupported data type for column '${column.name}': ${column.dataType}`
					);
			}
		}
		
		await this.docEngine.insert(collection, ast.values);
	};

	private executeCreateTable = async (ast: CreateTableStatement): Promise<void> => {
		await this.systemCatalog.createTable(ast.table, ast.columns);
	};

	/**
	 * Translates a SQL WHERE clause AST into a StrataDoc Mongo-style query.
	 */
	private translateWhere = (node?: ASTNode): any => {
		if (!node) return {};

		if (node.type === NodeType.BinaryExpression) {
			const expr = node as BinaryExpression;

			// Handle Logical AND (Merge objects)
			if (expr.operator === "AND") {
				const left = this.translateWhere(expr.left);
				const right = this.translateWhere(expr.right);
				
				// Deep merge for AND logic
				const merged = { ...left };
				for (const key in right) {
					if (merged[key] && typeof merged[key] === "object" && typeof right[key] === "object") {
						merged[key] = { ...merged[key], ...right[key] };
					} else {
						merged[key] = right[key];
					}
				}
				return merged;
			}

			// Handle Comparisons (age > 18)
			if (["=", ">", "<", ">=", "<=", "!="].includes(expr.operator)) {
				return this.translateComparison(expr);
			}
		}

		throw new Error(`Unsupported WHERE clause structure: ${node.type}`);
	};

	private translateComparison = (expr: BinaryExpression): any => {
		// Assumption: Left is Identifier, Right is Literal
		// e.g. age > 18

		if (expr.left.type !== NodeType.Identifier) {
			throw new Error("Left side of comparison must be a column name");
		}
		if (expr.right.type !== NodeType.Literal) {
			throw new Error("Right side of comparison must be a value");
		}

		const key = (expr.left as Identifier).value;
		const value = (expr.right as Literal).value;
		const op = expr.operator;

		switch (op) {
			case "=":
				return { [key]: value };
			case ">":
				return { [key]: { $gt: value } };
			case "<":
				return { [key]: { $lt: value } };
			case ">=":
				return { [key]: { $gte: value } };
			case "<=":
				return { [key]: { $lte: value } };
			case "!=":
				return { [key]: { $ne: value } };
			default:
				throw new Error(`Unsupported operator: ${op}`);
		}
	};
}
