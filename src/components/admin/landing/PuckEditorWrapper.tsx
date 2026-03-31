'use client';

import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import type { Data, Config } from '@measured/puck';

interface PuckEditorWrapperProps {
  value: Data | undefined;
  onChange: (data: Data) => void;
  config: Config;
}

export default function PuckEditorWrapper({ value, onChange, config }: PuckEditorWrapperProps) {
  const initialData: Data = value ?? { root: { props: {} }, content: [], zones: {} };

  return (
    <div className="puck-editor-container" style={{ height: '100%', minHeight: '600px' }}>
      <Puck
        config={config}
        data={initialData}
        onPublish={(data) => {
          onChange(data);
        }}
        onChange={(data) => {
          onChange(data);
        }}
      />
    </div>
  );
}
