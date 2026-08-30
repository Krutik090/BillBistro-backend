import type { Preview } from "@storybook/react";
import React from "react";
import "../src/styles.css";

const preview: Preview = {
  globalTypes: {
    theme: { description: "Theme", toolbar: { icon: "mirror", items: ["dark", "light"], dynamicTitle: true } },
  },
  initialGlobals: { theme: "dark" },
  decorators: [
    (Story, ctx) => {
      const theme = ctx.globals.theme ?? "dark";
      document.documentElement.dataset.theme = theme;
      return (
        <div className="min-h-screen bg-background p-8 text-foreground">
          <Story />
        </div>
      );
    },
  ],
  parameters: { backgrounds: { disable: true }, layout: "fullscreen" },
};
export default preview;
