import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth.jsx";
import Donate from "./Donate.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/donate" element={<Donate />} />
        <Route path="*" element={<Navigate to="/donate" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
