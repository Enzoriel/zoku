import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import styles from "./TorrentAliasModal.module.css";

function TorrentAliasModal({ isOpen, onClose, initialValue, onSave }) {
  const [alias, setAlias] = useState(initialValue || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setAlias(initialValue || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialValue]);

  const handleSave = () => {
    onSave(alias.trim());
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="VINCULAR ALIAS NYAA"
      subtitle="Personaliza el nombre de búsqueda para que Zoku detecte episodios futuros correctamente en Nyaa."
      footer={
        <>
          <button className={`${styles.btn} ${styles.cancelBtn}`} onClick={onClose}>
            CANCELAR
          </button>
          <button className={`${styles.btn} ${styles.saveBtn}`} onClick={handleSave}>
            GUARDAR ALIAS
          </button>
        </>
      }
    >
      <div className={styles.inputGroup}>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ej: [Erai-raws] Jujutsu Kaisen"
        />
        <p className={styles.hint}>
          💡 Tip: Incluir el nombre del fansub entre corchetes suele dar resultados más directos.
        </p>
      </div>
    </Modal>
  );
}

export default TorrentAliasModal;
