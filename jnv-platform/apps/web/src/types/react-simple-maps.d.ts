declare module "react-simple-maps" {
  import type { ReactElement, ReactNode } from "react";

  export type GeographyRenderProps = {
    geographies: Array<{
      rsmKey: string;
      properties: Record<string, unknown>;
      [key: string]: unknown;
    }>;
  };

  export const ComposableMap: (props: Record<string, unknown> & { children?: ReactNode }) => ReactElement;
  export const Geographies: (props: {
    geography: unknown;
    children: (props: GeographyRenderProps) => ReactNode;
  }) => ReactElement;
  export const Geography: (props: Record<string, unknown>) => ReactElement;
}
