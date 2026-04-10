import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy } from "react";
import "./App.css";
import { StoreProvider } from "./context/StoreContext";
import { AnimeProvider } from "./context/AnimeContext";
import { LibraryProvider } from "./context/LibraryContext";
import { TorrentProvider } from "./context/TorrentContext";
import { RecentAnimeProvider } from "./context/RecentAnimeContext";
import Layout from "./components/layout/Layout";
import { GlobalSync } from "./components/core/GlobalSync";
import { WelcomeSetupModal } from "./components/core/WelcomeSetupModal";

// Importaciones directas para evitar parpadeos
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import AnimeDetails from "./pages/AnimeDetails";
import Recent from "./pages/Recent";

// Importaciones lazy para secciones menos frecuentes
const Search = lazy(() => import("./pages/Search"));
const Library = lazy(() => import("./pages/Library"));
const Stats = lazy(() => import("./pages/Stats"));
const Configuration = lazy(() => import("./pages/Configuration"));
const History = lazy(() => import("./pages/History"));
const TorrentPage = lazy(() => import("./pages/TorrentPage"));

function App() {
  return (
    <StoreProvider>
      <AnimeProvider>
        <TorrentProvider>
          <LibraryProvider>
            <RecentAnimeProvider>
              <BrowserRouter>
                <GlobalSync />
                <WelcomeSetupModal />
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="discover" element={<Discover />} />
                    <Route path="search" element={<Search />} />
                    <Route path="my-animes" element={<Navigate to="/library" replace />} />
                    <Route path="library" element={<Library />} />
                    <Route path="recent" element={<Recent />} />
                    <Route path="history" element={<History />} />
                    <Route path="torrents" element={<TorrentPage />} />
                    <Route path="stats" element={<Stats />} />
                    <Route path="configuration" element={<Configuration />} />
                    <Route path="anime/:id" element={<AnimeDetails />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </RecentAnimeProvider>
          </LibraryProvider>
        </TorrentProvider>
      </AnimeProvider>
    </StoreProvider>
  );
}

export default App;
