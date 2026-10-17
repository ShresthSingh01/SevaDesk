export interface PortalFieldConfig {
  targetSelector: string;
  fallbackSelectors?: string[];
  transform?: 'digits_only' | 'uppercase' | 'date_dmy' | 'date_ymd';
  required?: boolean;
}

export interface PortalAdapterDefinition {
  id: string;
  name: string;
  state: string;
  portalDomain: string;
  version: string;
  description: string;
  fields: Record<string, PortalFieldConfig>;
  disallowedSelectors: string[];
}

export declare const PORTAL_ADAPTERS: PortalAdapterDefinition[];
export declare function findAdapterByUrl(url?: string): PortalAdapterDefinition;
export declare function transformValue(value?: string, transform?: string): string;
