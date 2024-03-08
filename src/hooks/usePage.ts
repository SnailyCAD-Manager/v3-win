import { create } from "zustand";

export enum ValidPage {
	Home = "Home",
	Requirements = "Requirements",
	Installing = "Installing",
	Error = "Error",
}

type PageStore = {
	page: ValidPage;
	setPage: (page: ValidPage) => void;
};

export const usePage = create<PageStore>((set) => ({
	page: ValidPage.Requirements,
	setPage: (page) => set({ page }),
}));
