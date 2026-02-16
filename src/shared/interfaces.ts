export interface IKVIterator {
	init(): Promise<void>;
	advance(): Promise<void>;
	seek?(key: string): Promise<void>;
	get key(): string | null;
	get value(): string | null;
	get done(): boolean;
}

export interface Pair {
	key: string;
	value: string;
}

export interface BlockIndex {
	key: string;
	offset: number;
}

export interface StrataDocFindOptions {
	limit?: number;
	skip?: number;
}

export const QueryOperations = {
	gt: "$gt",
	lt: "$lt",
	gte: "$gte",
	lte: "$lte",
	ne: "$ne",
	in: "$in",
	nin: "$nin",
} as const;
export type QueryOperationsType =
	(typeof QueryOperations)[keyof typeof QueryOperations];

export enum TokenType {
	Keyword,
	Identifier,
	Number,
	String,
	Operator,
	Punctuation,
	EOF,
}

export interface Token {
	type: TokenType;
	value: string;
}

// --- SQL AST Interfaces ---

export enum NodeType {
	Program,
	SelectStatement,
	InsertStatement,
	CreateTableStatement,
	BinaryExpression,
	Literal,
	Identifier,
	BeginStatement,
	CommitStatement,
	RollbackStatement,
}

export interface ASTNode {
	type: NodeType;
}

export interface BeginStatement extends ASTNode {
	type: NodeType.BeginStatement;
}

export interface CommitStatement extends ASTNode {
	type: NodeType.CommitStatement;
}

export interface RollbackStatement extends ASTNode {
	type: NodeType.RollbackStatement;
}

export interface Identifier extends ASTNode {
	type: NodeType.Identifier;
	value: string;
}

export interface Literal extends ASTNode {
	type: NodeType.Literal;
	value: string | number | boolean;
	dataType: "string" | "number" | "boolean";
}

export interface BinaryExpression extends ASTNode {
	type: NodeType.BinaryExpression;
	left: ASTNode;
	operator: string;
	right: ASTNode;
}

export interface SelectStatement extends ASTNode {
	type: NodeType.SelectStatement;
	columns: string[]; // "*" or column names
	table: string;
	where?: ASTNode;
}

export interface InsertStatement extends ASTNode {
	type: NodeType.InsertStatement;
	table: string;
	values: Record<string, any>; // Simplified for now (key-value pairs)
}

export interface ColumnDefinition {
	name: string;
	dataType: "INT" | "TEXT" | "BOOL";
}

export interface CreateTableStatement extends ASTNode {
	type: NodeType.CreateTableStatement;
	table: string;
	columns: ColumnDefinition[];
}

export interface TableSchema {
	name: string;
	columns: ColumnDefinition[];
}

export interface WALConfig {
	dataDir: string;
	walFile: string;
	encoding: BufferEncoding;
	dbSentinelValue: string;
}

export type MemTable = Map<string, string>; // In-memory key-value store

export type WALBatch = Map<string, string | null>; // null = tombstone

export interface IKVStorageEngine {
	database_get(key: string): Promise<string | null>;
	commitBatch(batch: WALBatch): Promise<void>;
	_get_db_sentinel_value(): string;
}
