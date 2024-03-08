import { usePage, ValidPage as Page } from "./hooks/usePage";
import ErrorPage from "@/pages/error";
import HomePage from "@/pages/home";
import InstallingPage from "@/pages/installing";
import RequirementsPage from "@/pages/requirements";

export default function App() {
	const page = usePage((state) => state.page);

	switch (page) {
		case Page.Home:
			return <HomePage />;
		case Page.Requirements:
			return <RequirementsPage />;
		case Page.Installing:
			return <InstallingPage />;
		case Page.Error:
			return <ErrorPage />;
		default:
			return <div>Invalid Page</div>;
	}
}
