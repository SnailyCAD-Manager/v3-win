import { useState } from "react";
import { usePage, ValidPage } from "./hooks/usePage";

export default function App() {
	const page = usePage((state) => state.page);
	
	if (page === ValidPage.Home) (
		return <HomePage />
	)
}
