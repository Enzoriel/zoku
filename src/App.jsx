import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import { StoreProvider } from "./context/StoreContext";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import Search from "./pages/Search";
import MyAnimes from "./pages/MyAnimes";
import Library from "./pages/Library";
import Stats from "./pages/Stats";
import Configuration from "./pages/Configuration";
import AnimeDetails from "./pages/AnimeDetails";

function App() {
  return (
    <StoreProvider>
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
    </StoreProvider>
  );
}

export default App;
