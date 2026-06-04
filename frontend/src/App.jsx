import { useState, useEffect } from 'react';
import VoiceChat from './components/VoiceChat';

function App() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleError = (event) => {
        console.error("Global Error Caught:", event.error);
        setError(event.error?.message || "Unknown Runtime Error");
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', (event) => {
        console.error("Unhandled Promise Rejection:", event.reason);
        setError(event.reason?.message || "Promise Rejection Error");
    });
    return () => {
        window.removeEventListener('error', handleError);
    };
  }, []);

  if (error) {
    return (
        <div style={{ padding: '20px', color: 'white', background: 'red', height: '100vh' }}>
            <h1>App Crashed</h1>
            <pre>{error}</pre>
            <button onClick={() => window.location.reload()}>Reload</button>
        </div>
    );
  }

  return (
    <div className="App">
      <VoiceChat />
    </div>
  );
}

export default App;
