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
        onChange={(e) => setFolderSearch(e.target.value)}
        autoFocus
      />
      <div className={styles.folderList}>
        {filteredFolders.length === 0 && (
          <p className={styles.emptyFolderText}>No hay carpetas sin vincular disponibles.</p>
        )}
        {filteredFolders.map((f) => (
          <div key={f.key} className={styles.folderItem} onClick={() => onLink(f.key)}>
            <span className={styles.folderName}>{f.key}</span>
            <span className={styles.folderEpCount}>{f.files?.length || 0} archivos</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default FolderLinkModal;
