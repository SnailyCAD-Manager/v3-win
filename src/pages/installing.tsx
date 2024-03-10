import { useEffect, useRef, useState } from "react";
import { ipcRenderer } from "electron";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconCopy } from "@tabler/icons-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export default function InstallingPage() {
	type Status = {
		step: string;
		status: string;
	};
	type Error = {
		error: string;
		trace: string[];
	};

	const [step, setStep] = useState("Checking Installation");
	const [status, setStatus] = useState("Please wait...");
	const [errorTrace, setErrorTrace] = useState<Error["trace"]>([]);

	const componentLoad = useRef(false);

	useEffect(() => {
		async function main() {
			ipcRenderer.send("install");

			ipcRenderer.on("install-status", (_, status: Status) => {
				setStep(status.step);
				setStatus(status.status);
			});

			ipcRenderer.on("install-error", (_, error: Error) => {
				setStep("Error");
				setStatus(error.error);
				setErrorTrace(error.trace);
			});
		}

		if (!componentLoad.current) [(componentLoad.current = true), main()];
	}, []);

	function copyStackTrace() {
		navigator.clipboard.writeText(errorTrace.join("\n"));
	}

	return (
		<div className="w-screen h-screen">
			<div className="flex flex-col items-center justify-center gap-3 h-full">
				{step !== "Error" && (
					<>
						<h1 className="text-2xl font-bold">{step}</h1>
						<p className="text-muted-foreground animate-pulse">
							{status}
						</p>
					</>
				)}

				{step === "Error" && (
					<>
						<h1 className="text-2xl font-bold">
							An error occurred
						</h1>
						<p className="text-muted-foreground">{status}</p>
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="secondary" size="sm">
									View Stack Trace
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Stack Trace</DialogTitle>
									<DialogDescription>
										{status}
									</DialogDescription>
								</DialogHeader>
								<div className="bg-black p-3 rounded-lg relative">
									<Tooltip delayDuration={0}>
										<TooltipTrigger asChild>
											<Button
												variant="outline"
												size="icon"
												onClick={copyStackTrace}
												className="absolute top-1 right-1 size-7 z-10"
											>
												<IconCopy className="size-3" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Copy</TooltipContent>
									</Tooltip>
									<ScrollArea className="h-[300px] font-mono whitespace-pre-wrap">
										{errorTrace.map((trace, index) => (
											<p
												key={index}
												className="text-xs text-muted-foreground"
											>
												{trace}
											</p>
										))}
									</ScrollArea>
								</div>
							</DialogContent>
						</Dialog>
					</>
				)}
			</div>
		</div>
	);
}
