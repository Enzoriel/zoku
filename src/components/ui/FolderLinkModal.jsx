import Modal from "./Modal";
import styles from "../../pages/AnimeDetails.module.css";

function FolderLinkModal({ isOpen, onClose, folderSearch, setFolderSearch, filteredFolders, onLink }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="VINCULAR CARPETA"
      subtitle="Busca y selecciona la carpeta local que contenga los archivos de esta serie."
    >
      <input
        type="text"
        className={styles.folderSearchInput}
        placeholder="Buscar carpeta..."
        value={folderSearch}
        onChange={(event) => setFolderSearch(event.target.value)}
        autoFocus
      />
      <div className={styles.folderList} role="list">
        {filteredFolders.length === 0 && <p className={styles.emptyFolderText}>No hay carpetas sin vincular disponibles.</p>}
        {filteredFolders.map((folder) => (
          <button
            key={folder.key}
            type="button"
            className={styles.folderItem}
            onClick={() => onLink(folder.key)}
            aria-label={`Vincular carpeta ${folder.key}`}
          >
            <span className={styles.folderName}>{folder.key}</span>
            <span className={styles.folderEpCount}>{folder.files?.length || 0} archivos</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default FolderLinkModal;
