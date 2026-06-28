import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { DataProvider } from "./lib/store.jsx";
import Login from "./pages/Login.jsx";
import App from "./App.jsx";
import "./index.css";

function Gate() {
  const { loading, session } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }
  if (!session) return <Login />;
  return (
    <DataProvider>
      <App />
    </DataProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
