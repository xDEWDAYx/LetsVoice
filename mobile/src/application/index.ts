import { databaseManager } from "@/database";

import { AppContainer } from "./app-container";

export { AppContainer } from "./app-container";

export const appContainer = new AppContainer(databaseManager);
