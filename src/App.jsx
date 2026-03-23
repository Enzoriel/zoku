import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy } from "react";
import "./App.css";
import { StoreProvider } from "./context/StoreContext";
import { AnimeProvider } from "./context/AnimeContext";
import { LibraryProvider } from "./context/LibraryContext";
import Layout from "./components/layout/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Discover = lazy(() => import("./pages/Discover"));
const Search = lazy(() => import("./pages/Search"));
const MyAnimes = lazy(() => import("./pages/MyAnimes"));
const Library = lazy(() => import("./pages/Library"));
const Stats = lazy(() => import("./pages/Stats"));
const Configuration = lazy(() => import("./pages/Configuration"));
const AnimeDetails = lazy(() => import("./pages/AnimeDetails"));

function App() {
  return (
    <AnimeProvider>
      <StoreProvider>
        <LibraryProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="discover" element={<Discover />} />
                <Route path="search" element={<Search />} />
                <Route path="my-animes" element={<MyAnimes />} />
                <Route path="library" element={<Library />} />
                <Route path="stats" element={<Stats />} />
                <Route path="configuration" element={<Configuration />} />
                <Route path="anime/:id" element={<AnimeDetails />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </LibraryProvider>
      </StoreProvider>
    </AnimeProvider>
  );
}

export default App;
