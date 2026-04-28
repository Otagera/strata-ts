import {
	QueryClient,
	QueryClientProvider,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import {
	Activity,
	Box,
	Database,
	Layers,
	RefreshCcw,
	Table as TableIcon,
	Terminal,
	Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { SidebarItem, StatCard } from "./components/Common.tsx";
import {
	CollectionGrid,
	KVExplorer,
	TableView,
} from "./components/Explorers.tsx";
import { Monitoring } from "./components/Monitoring.tsx";
import { Workbench } from "./components/Workbench.tsx";

const queryClient = new QueryClient();

export default function App() {
	const [view, setView] = useState("workbench");
	const [query, setQuery] = useState("");
	const [logs, setLogs] = useState<any[]>([]);
	const [results, setResults] = useState<any>(null);

	useEffect(() => {
		const ws = new WebSocket(`ws://${(window as any).location.host}/ws`);
		ws.onmessage = (e) => {
			const data = JSON.parse(e.data);
			setLogs((prev) => [...prev.slice(-49), data]);
		};
		return () => ws.close();
	}, []);

	const { data: status, refetch: refetchStatus } = useQuery({
		queryKey: ["status"],
		queryFn: () => fetch("/api/status").then((res) => res.json()),
		refetchInterval: 5000,
	});

	const { data: tables, refetch: refetchTables } = useQuery({
		queryKey: ["tables"],
		queryFn: () => fetch("/api/tables").then((res) => res.json()),
		enabled: view === "sql",
	});

	const { data: collections, refetch: refetchCollections } = useQuery({
		queryKey: ["collections"],
		queryFn: () => fetch("/api/collections").then((res) => res.json()),
		enabled: view === "doc",
	});

	const { data: kvData, refetch: refetchKV } = useQuery({
		queryKey: ["kv"],
		queryFn: () => fetch("/api/kv/scan").then((res) => res.json()),
		enabled: view === "kv",
	});

	const executeMutation = useMutation({
		mutationFn: (sql: string) =>
			fetch("/api/query", {
				method: "POST",
				body: JSON.stringify({ query: sql }),
			}).then((res) => res.json()),
		onSuccess: (data) => {
			setResults(data);
			refetchStatus();
			if (view === "sql") refetchTables();
			if (view === "doc") refetchCollections();
			if (view === "kv") refetchKV();
		},
	});

	const seedMutation = useMutation({
		mutationFn: () =>
			fetch("/api/seed", { method: "POST" }).then((res) => res.json()),
		onSuccess: () => {
			refetchStatus();
			alert("Database seeded with demo data!");
		},
	});

	const handleRun = () => {
		if (!query.trim()) return;
		executeMutation.mutate(query);
	};

	const renderContent = () => {
		switch (view) {
			case "sql":
				return <TableView data={tables as any[]} />;
			case "doc":
				return (
					<CollectionGrid
						collections={collections}
						onSelect={(col: string) => {
							setView("workbench");
							setQuery(`FIND ${col} {}`);
						}}
					/>
				);
			case "kv":
				return <KVExplorer data={kvData as any[]} />;
			case "monitor":
				return (
					<Monitoring status={status} onSeed={() => seedMutation.mutate()} />
				);
			case "workbench":
			default:
				return (
					<Workbench
						query={query}
						setQuery={setQuery}
						handleRun={handleRun}
						results={results}
						executeMutation={executeMutation}
						logs={logs}
					/>
				);
		}
	};

	return (
		<div className="flex h-screen w-full bg-spacetime text-gray-200">
			<aside className="w-64 border-r border-spacetime flex flex-col">
				<div
					className="p-6 flex items-center gap-2 mb-4 cursor-pointer"
					onClick={() => (window.location.href = "/")}
				>
					<div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center font-bold text-white italic">
						S
					</div>
					<span className="font-bold tracking-tight text-lg">
						Strata<span className="text-green-500">DB</span>
					</span>
				</div>

				<nav className="flex-1">
					<div className="px-4 mb-2 text-[10px] uppercase tracking-widest text-spacetime-dim">
						Explore
					</div>
					<SidebarItem
						icon={Terminal}
						label="Workbench"
						active={view === "workbench"}
						onClick={() => setView("workbench")}
					/>
					<SidebarItem
						icon={TableIcon}
						label="SQL Tables"
						active={view === "sql"}
						onClick={() => setView("sql")}
					/>
					<SidebarItem
						icon={Layers}
						label="Collections"
						active={view === "doc"}
						onClick={() => setView("doc")}
					/>
					<SidebarItem
						icon={Box}
						label="KV Explorer"
						active={view === "kv"}
						onClick={() => setView("kv")}
					/>

					<div className="px-4 mt-8 mb-2 text-[10px] uppercase tracking-widest text-spacetime-dim">
						Operations
					</div>
					<SidebarItem
						icon={Activity}
						label="Monitoring"
						active={view === "monitor"}
						onClick={() => setView("monitor")}
					/>
				</nav>

				<div className="p-4 border-t border-spacetime text-[10px] text-spacetime-dim">
					Environment: <span className="text-green-500">Local (Port 2345)</span>
				</div>
			</aside>

			<main className="flex-1 flex flex-col">
				<header className="h-24 border-b border-spacetime grid grid-cols-4 gap-px bg-spacetime">
					<StatCard
						label="MemTable Size"
						value={(status as { memTableSize?: number })?.memTableSize || 0}
						icon={Zap}
					/>
					<StatCard
						label="SSTables"
						value={(status as { sstCount?: number })?.sstCount || 0}
						icon={Database}
					/>
					<StatCard
						label="Space ID"
						value={(status as { spaceId?: string })?.spaceId || "default"}
						icon={RefreshCcw}
					/>
					<div className="flex items-center justify-center bg-[#161b22] px-4">
						<button
							onClick={() => {
								refetchStatus();
								refetchTables();
								refetchCollections();
								refetchKV();
							}}
							className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition-colors"
						>
							<RefreshCcw size={14} /> Refresh
						</button>
					</div>
				</header>

				<div className="flex-1 overflow-auto bg-spacetime">
					{renderContent()}
				</div>
			</main>
		</div>
	);
}

const rootElement = document.getElementById("root");
if (rootElement) {
	const root = createRoot(rootElement);
	root.render(
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>,
	);
}
