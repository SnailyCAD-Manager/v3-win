import { create } from "zustand";

type ErrorStore = {
	error: string;
	setError: (error: string) => void;
};

export const useError = create<ErrorStore>((set) => ({
	error: "",
	setError: (error) => set({ error }),
}));
