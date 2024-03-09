import { ValidPage, usePage } from "@/hooks/usePage";
import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";

export default function RequirementsPage() {
	const requirements = ["Node.js", "Pnpm", "Git"];

	const [checking, setChecking] = useState(true);
	const [missing, setMissing] = useState<string[]>(["test", "test", "test"]);
	const setPage = usePage((state) => state.setPage);

	useEffect(() => {
		ipcRenderer.send("check-requirements");

		ipcRenderer.on("requirements-checked", (_, missing: string[]) => {
			if (missing.length === 0) {
				setChecking(false);
				setPage(ValidPage.Home);
				return;
			}

			setChecking(false);
			setMissing(missing);
		});
	}, []);
	return (
		<div className="w-screen h-screen">
			<div className="flex flex-col items-center justify-center gap-3 h-full">
				<h1 className="text-2xl font-bold">
					Checking System Requirements
				</h1>
				{checking && (
					<p className="text-muted-foreground animate-pulse">
						Please wait...
					</p>
				)}
				{!checking && (
					<div className="flex flex-col gap-3">
						<p className="text-muted-foreground">
							We couldn't find the following requirements:
						</p>
						<ul className="list-disc list-inside">
							{missing.map((requirement, index) => (
								<li key={index}>{requirement}</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</div>
	);
}
