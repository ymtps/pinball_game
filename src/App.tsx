import { useState } from "react";
import { PinballGame } from "./components/PinballGame";
import { TableEditor } from "./components/TableEditor";
import type { TableLayoutConfig } from "./game/tableConfig";
import { getDefaultLayout } from "./game/tableConfig";

type AppMode = "editor" | "play";

function App() {
  const [mode, setMode] = useState<AppMode>("play");
  const [layout, setLayout] = useState<TableLayoutConfig>(getDefaultLayout);
  // Key to force PinballGame remount when layout changes
  const [playKey, setPlayKey] = useState(0);

  function handlePlay() {
    setPlayKey((k) => k + 1);
    setMode("play");
  }

  function handleBackToEditor() {
    setMode("editor");
  }

  if (mode === "editor") {
    return (
      <TableEditor
        layout={layout}
        onLayoutChange={setLayout}
        onPlay={handlePlay}
      />
    );
  }

  return (
    <PinballGame
      key={playKey}
      layout={layout}
      onBackToEditor={handleBackToEditor}
    />
  );
}

export default App;
