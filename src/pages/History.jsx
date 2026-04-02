import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { formatRelativeDate, getLocalDayKey } from "../utils/dateFormat";
import styles from "./History.module.css";

const MONTH_NAMES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

function History() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [view, setView] = useState("days");

  const historyData = useMemo(() => {
    const allEvents = [];

    Object.values(data.myAnimes || {}).forEach((anime) => {
      (anime.watchHistory || []).forEach((entry) => {
        allEvents.push({
          type: "episode",
          animeId: anime.malId,
          animeTitle: anime.title,
          coverImage: anime.coverImage,
          episode: entry.episode,
          date: new Date(entry.watchedAt),
          timestamp: new Date(entry.watchedAt).getTime(),
        });
      });

      if (anime.completedAt && anime.userStatus === "COMPLETED") {
        allEvents.push({
          type: "completed",
          animeId: anime.malId,
          animeTitle: anime.title,
          coverImage: anime.coverImage,
          totalEpisodes: anime.totalEpisodes,
          date: new Date(anime.completedAt),
          timestamp: new Date(anime.completedAt).getTime(),
        });
      }
    });

    allEvents.sort((a, b) => b.timestamp - a.timestamp);
    return allEvents;
  }, [data.myAnimes]);

  const groupedByDay = useMemo(() => {
    const groups = {};
    historyData.forEach((event) => {
      const key = getLocalDayKey(event.date);
      if (!groups[key]) groups[key] = { date: event.date, events: [] };
      groups[key].events.push(event);
    });

    return Object.entries(groups)
      .sort(([first], [second]) => second.localeCompare(first))
      .map(([key, value]) => ({ key, ...value }));
  }, [historyData]);

  const groupedByMonth = useMemo(() => {
    const groups = {};
    historyData.forEach((event) => {
      const key = `${event.date.getFullYear()}-${String(event.date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) {
        groups[key] = {
          year: event.date.getFullYear(),
          month: event.date.getMonth(),
          events: [],
          episodeCount: 0,
          completedCount: 0,
        };
      }

      groups[key].events.push(event);
      if (event.type === "episode") groups[key].episodeCount += 1;
      if (event.type === "completed") groups[key].completedCount += 1;
    });

    return Object.entries(groups)
      .sort(([first], [second]) => second.localeCompare(first))
      .map(([key, value]) => ({ key, ...value }));
  }, [historyData]);

  const formatTime = (date) => date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

  const collapseEpisodes = (events) => {
    const result = [];
    const animeEpisodes = {};

    events.forEach((event) => {
      if (event.type === "completed") {
        result.push(event);
        return;
      }

      const key = event.animeId;
      if (!animeEpisodes[key]) {
        animeEpisodes[key] = { ...event, episodes: [event.episode] };
        result.push(animeEpisodes[key]);
      } else {
        animeEpisodes[key].episodes.push(event.episode);
      }
    });

    return result;
  };

  const totalEpisodes = historyData.filter((entry) => entry.type === "episode").length;
  const totalCompleted = historyData.filter((entry) => entry.type === "completed").length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerText}>
            <h1 className={styles.pageTitle}>HISTORIAL</h1>
            <p className={styles.pageSubtitle}>Tu actividad de visualizacion</p>
          </div>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${view === "days" ? styles.activeTab : ""}`}
              onClick={() => setView("days")}
            >
              POR DIAS
            </button>
            <button
              className={`${styles.tab} ${view === "months" ? styles.activeTab : ""}`}
              onClick={() => setView("months")}
            >
              POR MESES
            </button>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{totalEpisodes}</span>
            <span className={styles.statLabel}>EPISODIOS VISTOS</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>{totalCompleted}</span>
            <span className={styles.statLabel}>SERIES COMPLETADAS</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>{Object.keys(data.myAnimes || {}).length}</span>
            <span className={styles.statLabel}>EN BIBLIOTECA</span>
          </div>
        </div>
      </header>

      {historyData.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No hay historial de visualizacion todavia.</p>
          <span>Los episodios que marques como vistos apareceran aqui.</span>
        </div>
      ) : view === "days" ? (
        <div className={styles.timeline}>
          {groupedByDay.map(({ key, date, events }) => {
            const collapsed = collapseEpisodes(events);
            return (
              <div key={key} className={styles.dayBlock}>
                <div className={styles.dayHeader}>
                  <div className={styles.dayDot} />
                  <div className={styles.dayMeta}>
                    <span className={styles.dayLabel}>{formatRelativeDate(date)}</span>
                    <span className={styles.dayFull}>
                      {date.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
                    </span>
                  </div>
                  <span className={styles.dayCount}>{events.filter((entry) => entry.type === "episode").length} EP</span>
                </div>

                <div className={styles.dayEvents}>
                  {collapsed.map((event, index) => (
                    <div
                      key={index}
                      className={`${styles.eventRow} ${event.type === "completed" ? styles.completedRow : ""}`}
                      onClick={() => navigate(`/anime/${event.animeId}`)}
                      onKeyDown={(keyboardEvent) => {
                        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                          keyboardEvent.preventDefault();
                          navigate(`/anime/${event.animeId}`);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.eventPoster}>
                        <img src={event.coverImage} alt={event.animeTitle} loading="lazy" />
                      </div>

                      <div className={styles.eventInfo}>
                        <span className={styles.eventTitle}>{event.animeTitle}</span>
                        {event.type === "completed" ? (
                          <span className={styles.completedLabel}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            SERIE COMPLETADA · {event.totalEpisodes} episodios
                          </span>
                        ) : event.episodes?.length > 1 ? (
                          <span className={styles.eventEps}>
                            {event.episodes.length} episodios ·{" "}
                            {event.episodes
                              .sort((first, second) => first - second)
                              .map((episode) => `EP ${episode}`)
                              .join(", ")}
                          </span>
                        ) : (
                          <span className={styles.eventEps}>Episodio {event.episode}</span>
                        )}
                      </div>

                      <span className={styles.eventTime}>{formatTime(event.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.monthList}>
          {groupedByMonth.map(({ key, year, month, episodeCount, completedCount, events }) => {
            const animeSet = new Set(events.map((event) => event.animeId));
            const posters = [...animeSet]
              .slice(0, 5)
              .map((animeId) => events.find((event) => event.animeId === animeId)?.coverImage)
              .filter(Boolean);

            return (
              <div key={key} className={styles.monthBlock}>
                <div className={styles.monthHeader}>
                  <div className={styles.monthTitleGroup}>
                    <span className={styles.monthName}>{MONTH_NAMES[month]}</span>
                    <span className={styles.monthYear}>{year}</span>
                  </div>
                  <div className={styles.monthPosters}>
                    {posters.map((src, index) => (
                      <img
                        key={index}
                        src={src}
                        alt={`Poster destacado del mes ${MONTH_NAMES[month]}`}
                        className={styles.monthPoster}
                        style={{ zIndex: posters.length - index }}
                      />
                    ))}
                  </div>
                  <div className={styles.monthStats}>
                    <div className={styles.monthStat}>
                      <span className={styles.monthStatValue}>{episodeCount}</span>
                      <span className={styles.monthStatLabel}>EP</span>
                    </div>
                    {completedCount > 0 && (
                      <div className={`${styles.monthStat} ${styles.completedStat}`}>
                        <span className={styles.monthStatValue}>{completedCount}</span>
                        <span className={styles.monthStatLabel}>COMPLETADAS</span>
                      </div>
                    )}
                    <div className={styles.monthStat}>
                      <span className={styles.monthStatValue}>{animeSet.size}</span>
                      <span className={styles.monthStatLabel}>SERIES</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default History;
