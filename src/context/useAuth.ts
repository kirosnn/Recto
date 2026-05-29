import { useContext } from "react";
import { Ctx } from "./AuthContext";

export function useAuth() { return useContext(Ctx); }
