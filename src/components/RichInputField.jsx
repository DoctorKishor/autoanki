import React, { useRef, useEffect } from 'react';

export default function RichInputField({
  value = '',
  onChange,
  placeholder = '',
  className = '',
  themeMode = 'light',
  minHeight = '100px',
  maxHeight = '300px',
  editorRef: externalRef = null
}) {
  const internalRef = useRef(null);
  const editorRef = externalRef || internalRef;

  // Synchronize external value with editor innerHTML only if content changed
  useEffect(() => {
    if (editorRef.current) {
      if (editorRef.current.innerHTML !== (value || '')) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value, editorRef]);

  // Handle Input change
  const handleInput = () => {
    if (editorRef.current && onChange) {
      const html = editorRef.current.innerHTML;
      const cleanHtml = (editorRef.current.innerText.trim() === '' && !html.includes('<img')) ? '' : html;
      onChange(cleanHtml);
    }
  };

  // Helper to insert an <img> tag cleanly at current selection point
  const insertInlineImage = (src) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let range;
    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
    }

    const imgContainer = document.createElement('div');
    imgContainer.contentEditable = 'false';
    imgContainer.className = 'inline-image-wrapper my-2 relative inline-block group max-w-full select-none';

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Inline Image';
    img.className = 'max-w-full rounded-xl border border-gray-700/50 shadow-md max-h-[320px] object-contain my-1.5 display-block';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '320px';
    img.style.borderRadius = '12px';
    img.style.margin = '6px 0';
    img.style.display = 'block';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.innerHTML = '✕';
    delBtn.className = 'absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-[10px] font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer z-20 hover:scale-110';
    delBtn.title = 'Remove Image';
    delBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      imgContainer.remove();
      handleInput();
    };

    imgContainer.appendChild(img);
    imgContainer.appendChild(delBtn);

    range.deleteContents();
    range.insertNode(imgContainer);

    // Create a new line space after the image container
    const br = document.createElement('br');
    range.setStartAfter(imgContainer);
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);

    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }

    handleInput();
  };

  // Handle Paste event for images & formatted text
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let imageItem = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageItem = items[i];
        break;
      }
    }

    if (imageItem) {
      e.preventDefault();
      e.stopPropagation();
      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result;
        insertInlineImage(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  const dark = themeMode === 'dark';
  const isEmpty = !value || value.trim() === '' || value === '<br>';

  return (
    <div className="relative w-full">
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        style={{ minHeight, maxHeight, scrollbarWidth: 'none' }}
        className={`w-full p-4 rounded-2xl outline-none overflow-y-auto custom-scrollbar leading-relaxed font-sans transition ${className} ${
          dark
            ? 'neu-pressed-dark text-white border border-gray-800 focus:border-blue-500/50'
            : 'neu-pressed-light text-gray-900 border border-gray-200 focus:border-blue-400'
        }`}
      />
      {isEmpty && (
        <div className={`absolute top-4 left-4 pointer-events-none text-xs font-mono select-none ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
          {placeholder}
        </div>
      )}
    </div>
  );
}
