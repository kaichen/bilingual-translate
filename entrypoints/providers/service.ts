import {services} from "../config/option";
import microsoft from "./translate/microsoft";
import google from "./translate/google";
import chromeTranslator from "./translate/chrome-builtin-ai";
import {chatServices} from "./llm/chat";

type ServiceFunction = (message: any) => Promise<any>;
type ServiceMap = {[key: string]: ServiceFunction;};

export const _service: ServiceMap = {
    [services.microsoft]: microsoft,
    [services.google]: google,
    [services.chromeTranslator]: chromeTranslator,
    ...chatServices,
};
