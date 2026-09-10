export type Specimen = { label: string; uri: string; size?: string };

export type CallResult = { files: Specimen[]; reveals: boolean };

/** One entry in the call sheet. `reveals` says whether the stage will animate the result. */
export type Call = { name: string; hint: string; run: () => Promise<CallResult> };
