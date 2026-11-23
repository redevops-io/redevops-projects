import { createContext, useContext } from "react";

// What kind of data the screen is showing, so no view has to guess and no label can be wrong:
//   mock    the built-in standalone client (no server at all)
//   sample  a server whose Today feed says basis "sample" (a public demo; synthetic data, simulated actions)
//   live    a server that serves real data (the feed says anything else)
//   unknown the server hasn't said (yet, or it didn't answer) — labelled as example data until proven otherwise
export type DataBasis = "mock" | "sample" | "live" | "unknown";
export const DataBasisContext = createContext<DataBasis>("unknown");
export const useDataBasis = () => useContext(DataBasisContext);
