import './SilkVeil.css';

/** 全屏绢色帷幕：场景切换时淡入淡出 */
export default function SilkVeil({ shown }) {
  return <div className={`silk-veil ${shown ? 'is-shown' : ''}`} aria-hidden="true" />;
}
