import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";
import killPort from "kill-port";
import download from "download";

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
	? process.env.DIST
	: path.join(process.env.DIST, "../public");

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
	win = new BrowserWindow({
		icon: path.join(process.env.VITE_PUBLIC, "logo.png"),
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
		},
		title: "SnailyCAD Manager v3",
		autoHideMenuBar: true,
	});

	// Test active push message to Renderer-process.
	win.webContents.on("did-finish-load", () => {
		win?.webContents.send(
			"main-process-message",
			new Date().toLocaleString(),
		);
	});

	if (process.env.NODE_ENV === "development") {
		win.webContents.openDevTools();
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		// win.loadFile('dist/index.html')
		win.loadFile(path.join(process.env.DIST, "index.html"));
	}
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

app.setLoginItemSettings({
	openAtLogin: true,
});

app.whenReady().then(createWindow);

ipcMain.on("check-requirements", async (e) => {
	// Check to see if the commands "node", "pnpm" and "git" are available.
	const missing: string[] = [];

	const check = (command: string) => {
		return new Promise<void>((resolve) => {
			const child = spawn(command, ["--version"]);

			child.on("error", () => {
				missing.push(command);
				resolve();
			});

			child.on("exit", (code: number) => {
				if (code !== 0) {
					missing.push(command);
				}

				resolve();
			});
		});
	};

	await Promise.all([check("node"), check("pnpm"), check("git")]);

	e.reply("requirements-checked", []);
});

ipcMain.on("install", async (e) => {
	const trace: string[] = [];

	const installDir = path.join(process.env.APPDATA as string, "scmv3");
	const downloadUrl =
		"https://github.com/SnailyCAD-Manager/v3/releases/latest/download/win-data.zip";

	trace.push("Checking for existing installation...");

	e.reply("install-status", {
		step: "Checking Installation",
		status: "Checking for existing installation...",
	});
	const installExists = fs.existsSync(installDir);
	if (installExists) {
		trace.push(
			"An existing installation was found. Using existing installation...",
		);
		e.reply("install-status", {
			step: "Installation Found",
			status: "An existing installation was found. Using existing installation...",
		});

		const settingsExists = fs.existsSync(
			path.join(installDir, "/app/api/data/settings.json"),
		);

		if (!settingsExists) {
			trace.push("settings.json not found");

			e.reply("install-error", {
				error: "settings.json not found",
				trace: [
					...trace,
					"settings.json not found",
					`Please delete the directory: ${installDir} and launch this application again.`,
				],
			});

			return;
		}

		const settings: {
			port: number;
		} = JSON.parse(path.join(installDir, "/app/api/data/settings.json"));

		if (!settings.port) {
			trace.push("Port not found in settings.json");

			e.reply("install-error", {
				error: "Port not found",
				trace: [
					...trace,
					"Port not found in settings.json",
					`Please delete the directory: ${installDir} and launch this application again.`,
				],
			});

			return;
		}

		trace.push("Starting the application...");
		e.reply("install-status", {
			step: "Starting",
			status: "Starting the application... -Type: existing",
		});

		// Start the application as a child process, make it attached to this process, so when this process is killed, the child process is also killed.
		const child = spawn("pnpm", ["run", "start"], {
			cwd: installDir,
			stdio: "inherit",
			shell: true,
		});

		child.stdout?.on("data", (data: Buffer | string) => {
			data = data.toString();

			trace.push(data);

			if (data.includes(`Server listening on port ${settings.port}`)) {
				e.reply("install-status", {
					step: "Started",
					status: "Application started successfully",
				});

				win?.loadURL(`http://localhost:${settings.port}`);
			}
		});

		child.stderr?.on("data", (data: Buffer | string) => {
			data = data.toString();

			trace.push(data);

			if (data.includes("Error: listen EADDRINUSE")) {
				e.reply("install-error", {
					error: "Port in use",
					trace: [
						...trace,
						`Port ${settings.port} is already in use`,
						"Please close the application using the port and try again.",
					],
				});
			}
		});

		child.on("error", (error) => {
			trace.push(error.message);

			e.reply("install-error", {
				error: "An error occurred",
				trace: [...trace, error.message],
			});
		});

		process.on("exit", async () => {
			await killPort(settings.port);
			child.kill();
		});

		return;
	}

	trace.push("No existing installation found. Installing...");

	e.reply("install-status", {
		step: "Installing",
		status: "No existing installation found. Installing...",
	});

	await fs.promises.mkdir(installDir, { recursive: true });

	try {
		await download(downloadUrl, installDir, {
			extract: true,
		});

		trace.push("Downloaded & extracted the latest release");

		e.reply("install-status", {
			step: "Downloaded",
			status: "Downloaded & extracted the latest release",
		});

		trace.push("Installing dependencies...");

		await new Promise<void>((resolve, reject) => {
			const child = spawn("pnpm", ["install"], {
				cwd: installDir,
				stdio: "inherit",
				shell: true,
			});

			child.stdout?.on("data", (data: Buffer | string) => {
				data = data.toString();

				trace.push(data);
			});

			child.stderr?.on("data", (data: Buffer | string) => {
				data = data.toString();

				trace.push(data);
			});

			child.on("error", (error) => {
				trace.push(error.message);

				e.reply("install-error", {
					error: "An error occurred",
					trace: [...trace, error.message],
				});

				reject();
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					trace.push(
						"An error occurred while installing dependencies",
					);

					e.reply("install-error", {
						error: "An error occurred",
						trace: [
							...trace,
							"An error occurred while installing dependencies",
						],
					});

					reject();
				}

				resolve();
			});
		});

		trace.push("Dependencies installed");

		e.reply("install-status", {
			step: "Dependencies Installed",
			status: "Dependencies installed",
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		trace.push(error.message);

		e.reply("install-error", {
			error: "An error occurred",
			trace: [...trace, error.message],
		});
	}

	trace.push("Starting the application...");

	e.reply("install-status", {
		step: "Starting",
		status: "Starting the application... -Type: new",
	});

	const child = spawn("pnpm", ["run", "start"], {
		cwd: installDir,
		stdio: "inherit",
		shell: true,
	});

	child.stdout?.on("data", (data: Buffer | string) => {
		data = data.toString();

		trace.push(data);

		if (data.includes("Server listening on port")) {
			e.reply("install-status", {
				step: "Started",
				status: "Application started successfully",
			});

			const settings: {
				port: number;
			} = JSON.parse(
				fs
					.readFileSync(path.join(installDir, "settings.json"))
					.toString(),
			);

			win?.loadURL(`http://localhost:${settings.port}`);
		}

		if (data.includes("Error: listen EADDRINUSE")) {
			e.reply("install-error", {
				error: "Port in use",
				trace: [
					...trace,
					"Port is already in use",
					"Please close the application using the port and try again.",
				],
			});
		}
	});

	child.stderr?.on("data", (data: Buffer | string) => {
		data = data.toString();

		trace.push(data);

		if (data.includes("Error: listen EADDRINUSE")) {
			e.reply("install-error", {
				error: "Port in use",
				trace: [
					...trace,
					"Port is already in use",
					"Please close the application using the port and try again.",
				],
			});
		}
	});

	process.on("exit", async () => {
		await killPort(3000);
		child.kill();
	});
});
