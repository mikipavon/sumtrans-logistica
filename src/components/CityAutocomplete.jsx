import { useState, useRef, useEffect } from 'react';

/**
 * Custom autocomplete for city/population names.
 * Replaces native <datalist> which doesn't work reliably on Android.
 */
export default function CityAutocomplete({ 
  value, 
  onChange, 
  poblaciones = [], 
  placeholder = 'Población', 
  className = '', 
  required = false,
  onSelect,
  id
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Filter suggestions based on input
  useEffect(() => {
    if (!value || value.length < 1) {
      setFiltered([]);
      return;
    }
    const search = value.toLowerCase();
    const matches = poblaciones
      .filter(p => p.toLowerCase().includes(search))
      .slice(0, 15); // Limit to 15 suggestions
    setFiltered(matches);
  }, [value, poblaciones]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelect = (poblacion) => {
    onChange({ target: { value: poblacion } });
    if (onSelect) onSelect(poblacion);
    setIsOpen(false);
    // Blur the input to hide the keyboard on mobile
    if (inputRef.current) inputRef.current.blur();
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        onChange={(e) => {
          onChange(e);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (value && value.length >= 1) setIsOpen(true);
        }}
      />
      {isOpen && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 9999,
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            marginTop: '2px',
          }}
        >
          {filtered.map((poblacion, idx) => (
            <div
              key={`${idx}-${poblacion}`}
              onClick={() => handleSelect(poblacion)}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleSelect(poblacion);
              }}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: '14px',
                borderBottom: idx < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                backgroundColor: '#fff',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#fff'}
            >
              {poblacion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
