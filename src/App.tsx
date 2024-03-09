import { usePage, ValidPage as Page } from "./hooks/usePage";
import ErrorPage from "@/pages/error";
import HomePage from "@/pages/home";
import InstallingPage from "@/pages/installing";
import RequirementsPage from "@/pages/requirements";
import { TooltipProvider } from "./components/ui/tooltip";

export default function App() {
	const page = usePage((state) => state.page);

	return (
		<TooltipProvider>
			{page === Page.Home && <HomePage />}
			{page === Page.Requirements && <RequirementsPage />}
			{page === Page.Installing && <InstallingPage />}
			{page === Page.Error && <ErrorPage />}
		</TooltipProvider>
	);
}
