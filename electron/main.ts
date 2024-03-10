import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";
import killPort from "kill-port";
import download from "download";
import axios from "axios";
import { compareVersions } from "compare-versions";

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
		height: 720,
		width: 1280,
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
	openAtLogin: process.env.NODE_ENV === "production",
});

app.whenReady().then(createWindow);

ipcMain.on("check-requirements", async (e) => {
	// Check to see if the commands "node", "pnpm" and "git" are available.
	const missing: string[] = [];

	const check = (command: string) => {
		return new Promise<void>((resolve) => {
			const child = spawn(command, ["--version"], {
				detached: false,
			});

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

	e.reply("requirements-checked", missing);
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
			path.join(installDir, "/apps/api/data/settings.json"),
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

		const fileContent = fs.readFileSync(
			path.join(installDir, "/apps/api/data/settings.json"),
			"utf-8",
		);
		const settings: {
			port: number;
		} = JSON.parse(fileContent);

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
			status: "Starting the application...",
		});

		const child = spawn("pnpm", ["run", "start"], {
			cwd: installDir,
			stdio: "ignore",
			shell: true,
			detached: false,
		});

		await new Promise<void>((resolve) => {
			const interval = setInterval(async () => {
				const response = await axios.get(
					`http://localhost:${settings.port}`,
				);

				if (response.status === 200) {
					clearInterval(interval);
					resolve();
				}
			}, 1000);
		});

		win?.loadURL(`http://localhost:${settings.port}`);
		win?.show();

		startUpdateCheck();

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
		trace.push("Downloading the application...");

		e.reply("install-status", {
			step: "Downloading",
			status: "Downloading SnailyCAD Manager...",
		});

		await download(downloadUrl, installDir, {
			extract: true,
		});

		trace.push("Installing dependencies...");

		e.reply("install-status", {
			step: "Installing Dependencies",
			status: "Installing dependencies...",
		});

		await new Promise<void>((resolve, reject) => {
			const child = spawn("pnpm", ["install"], {
				cwd: installDir,
				stdio: "ignore",
				shell: true,
				detached: false,
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
			status: "Dependencies installed.",
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
		status: "Starting the application...",
	});

	const child = spawn("pnpm", ["run", "start"], {
		cwd: installDir,
		stdio: "ignore",
		shell: true,
		detached: false,
	});

	const settingsContent = fs.readFileSync(
		path.join(installDir, "/apps/api/data/settings.json"),
		"utf-8",
	);

	const settings: {
		port: number;
	} = JSON.parse(settingsContent);

	console.log(`Starting the application on port: ${settings.port}`);

	await new Promise<void>((resolve) => {
		const interval = setInterval(async () => {
			const response = await axios.get(
				`http://localhost:${settings.port}`,
			);

			if (response.status === 200) {
				clearInterval(interval);
				resolve();
			}
		}, 1000);
	});

	win?.loadURL(`http://localhost:${settings.port}`);
	win?.show();

	process.on("exit", async () => {
		await killPort(settings.port);
		child.kill();
	});
});

process.on("exit", async () => {
	const settingsExists = fs.existsSync(
		path.join(
			process.env.APPDATA as string,
			"scmv3/apps/api/data/settings.json",
		),
	);

	if (settingsExists) {
		const settingsContent = fs.readFileSync(
			path.join(
				process.env.APPDATA as string,
				"scmv3/apps/api/data/settings.json",
			),
			"utf-8",
		);

		const settings: {
			port: number;
		} = JSON.parse(settingsContent);

		console.log(`Killing the application on port: ${settings.port}`);

		spawn("npx", ["kill-port", settings.port.toString()], {
			stdio: "ignore",
			shell: true,
			detached: true,
		}).unref();

		await killPort(settings.port);
	}
});

async function startUpdateCheck() {
	const currentVersion = app.getVersion();

	try {
		const latestVersion = await axios.get(
			`https://raw.githubusercontent.com/SnailyCAD-Manager/versions/main/win?v=${Date.now()}`,
		);

		if (compareVersions(latestVersion.data, currentVersion) === 1) {
			const alert = await dialog.showMessageBox(win as BrowserWindow, {
				type: "question",
				buttons: ["Yes", "No"],
				defaultId: 0,
				title: "Update Reminder",
				message:
					"An update is available for the application. Would you like to update now?",
			});

			if (alert.response === 0) {
				console.log("User wants to update the application");
			}

			if (alert.response === 1) {
				console.log("User doesn't want to update the application");

				setTimeout(startUpdateCheck, 1000 * 60 * 60);
			}

			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		dialog.showErrorBox(
			"Update check failed",
			`An error occurred while checking for updates: ${error.message}`,
		);

		setTimeout(startUpdateCheck, 1000 * 60 * 60);
	}

	setTimeout(startUpdateCheck, 1000 * 60 * 60);
}
