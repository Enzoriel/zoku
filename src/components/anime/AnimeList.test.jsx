import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnimeList from "./AnimeList";
import { useStore } from "../../hooks/useStore";
import { useLibrary } from "../../context/LibraryContext";

vi.mock("../../hooks/useStore");
vi.mock("../../context/LibraryContext");
vi.mock("./AnimeCardExt", () => ({
  default: ({ anime, malId, isInLibrary, onToggleLibrary }) => (
    <button type="button" onClick={() => onToggleLibrary(anime, malId)}>
      {isInLibrary ? `${anime.title} EN LISTA` : `${anime.title} AÑADIR`}
    </button>
  ),
}));

const anime = { malId: 1, title: "Test Anime", type: "TV", episodes: 12 };

function setupStore({ myAnimes = {}, localFiles = {}, performSyncResult = null } = {}) {
  const setMyAnimes = vi.fn(async (action) => {
    const next = typeof action === "function" ? action(myAnimes) : action;
    myAnimes = next;
    return next;
  });
  const performSync = vi.fn(async () => performSyncResult);

  useStore.mockReturnValue({
    data: { myAnimes, localFiles },
    setMyAnimes,
  });
  useLibrary.mockReturnValue({
    performSync,
    localFilesIndex: {},
  });

  return { setMyAnimes, performSync };
}

describe("AnimeList library actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an anime without opening a link modal when there are no candidates", async () => {
    const { setMyAnimes, performSync } = setupStore();

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime AÑADIR/i }));

    await waitFor(() => {
      expect(setMyAnimes).toHaveBeenCalledTimes(1);
      expect(performSync).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/Vincular carpeta detectada/i)).not.toBeInTheDocument();
  });

  it("opens a confirmation when adding an anime with one candidate folder", async () => {
    setupStore({
      localFiles: {
        "Test Anime": {
          folderName: "Test Anime",
          files: [{ name: "Test Anime 01.mkv" }],
        },
      },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime AÑADIR/i }));

    expect(await screen.findByText(/Vincular carpeta detectada/i)).toBeInTheDocument();
    expect(screen.getByText(/Test Anime.*1 archivo/i)).toBeInTheDocument();
  });

  it("accepts a detected folder and stores folderName", async () => {
    const { setMyAnimes } = setupStore({
      localFiles: {
        "Test Anime": {
          folderName: "Test Anime",
          files: [{ name: "Test Anime 01.mkv" }],
        },
      },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime AÑADIR/i }));
    fireEvent.click(await screen.findByRole("button", { name: /VINCULAR/i }));

    await waitFor(() => {
      const lastCall = setMyAnimes.mock.calls.at(-1)[0];
      const next = lastCall({ 1: { malId: 1, title: "Test Anime" } });
      expect(next[1].folderName).toBe("Test Anime");
    });
  });

  it("rejects a detected folder without removing the anime from the list", async () => {
    const { setMyAnimes } = setupStore({
      localFiles: {
        "Test Anime": {
          folderName: "Test Anime",
          files: [{ name: "Test Anime 01.mkv" }],
        },
      },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime AÑADIR/i }));
    fireEvent.click(await screen.findByRole("button", { name: /CANCELAR/i }));

    await waitFor(() => {
      const lastCall = setMyAnimes.mock.calls.at(-1)[0];
      const next = lastCall({ 1: { malId: 1, title: "Test Anime" } });
      expect(next[1].malId).toBe(1);
      expect(next[1].rejectedSuggestion.folderName).toBe("Test Anime");
    });
  });

  it("opens the manual link modal when adding an anime with multiple candidate folders", async () => {
    setupStore({
      localFiles: {
        "Test Anime A": {
          folderName: "Test Anime A",
          files: [{ name: "Test Anime A 01.mkv" }],
        },
        "Test Anime B": {
          folderName: "Test Anime B",
          files: [{ name: "Test Anime B 01.mkv" }],
        },
      },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime AÑADIR/i }));

    expect(await screen.findByText(/VINCULAR CARPETA/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vincular carpeta Test Anime A/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vincular carpeta Test Anime B/i })).toBeInTheDocument();
  });

  it("removes an anime directly when it has no watched episodes or linked files", async () => {
    const { setMyAnimes } = setupStore({
      myAnimes: { 1: { malId: 1, title: "Test Anime", watchedEpisodes: [] } },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime EN LISTA/i }));

    await waitFor(() => {
      const lastCall = setMyAnimes.mock.calls.at(-1)[0];
      expect(lastCall({ 1: { malId: 1 } })[1]).toBeUndefined();
    });
  });

  it("warns before removing an anime with watched episodes", async () => {
    setupStore({
      myAnimes: { 1: { malId: 1, title: "Test Anime", watchedEpisodes: [1, 2] } },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime EN LISTA/i }));

    expect(await screen.findByText(/Quitar serie con datos guardados/i)).toBeInTheDocument();
    expect(screen.getByText(/2 episodio\(s\) visto\(s\)/i)).toBeInTheDocument();
  });

  it("warns before removing an anime with linked local files", async () => {
    setupStore({
      myAnimes: { 1: { malId: 1, title: "Test Anime", watchedEpisodes: [], folderName: "Test Anime" } },
      localFiles: {
        "Test Anime": {
          folderName: "Test Anime",
          malId: 1,
          isLinked: true,
          files: [{ name: "Test Anime 01.mkv" }],
        },
      },
    });

    render(<AnimeList animes={[anime]} disablePagination />);
    fireEvent.click(screen.getByRole("button", { name: /Test Anime EN LISTA/i }));

    expect(await screen.findByText(/Quitar serie con datos guardados/i)).toBeInTheDocument();
    expect(screen.getByText(/1 archivo\(s\).*No se borrara nada del disco/i)).toBeInTheDocument();
  });
});
