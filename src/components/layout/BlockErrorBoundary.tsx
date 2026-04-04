import React from 'react';

interface Props {
  blockType: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export default class BlockErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`[BlockErrorBoundary] Error in block type "${this.props.blockType}":`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="text-sm text-sage italic">Unable to display this block</p>
      );
    }
    return this.props.children;
  }
}
