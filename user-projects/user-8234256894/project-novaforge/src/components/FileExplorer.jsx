const React = require('react');
const { useState } = require('react');

function FileExplorer({ files, onFileSelect, onFileChange, onCreateFile, onDeleteFile }) {
  const [expandedFolders, setExpandedFolders] =State(['src', 'public']);
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const toggleFolder = (path) => {
    setExpandedFolders(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetFolder) => {
    e.preventDefault();
    if (draggedItem && draggedItem.path !== targetFolder) {
      const newPath = targetFolder + '/' + draggedItem.name;
      onFileChange(draggedItem.path, newPath);
    }
    setDraggedItem(null);
  };

  const handleFileClick = (file) => {
    setSelectedFile(file.path);
    onFileSelect(file);
  };

  const createNewFile = (parentPath, type) => {
    const name = prompt(`Enter ${type} name:`);
    if (name) {
      const newPath = parentPath ? `${parentPath}/${name}` : name;
      onCreateFile({ path: newPath, name, type, content: type === 'file' ? '' : null });
    }
    closeContextMenu();
  };

  const deleteItem = (item) => {
    if (confirm(`Delete ${item.name}?`)) {
      onDeleteFile(item.path);
    }
    closeContextMenu();
  };

  const renderTree = (items, level = 0) => {
    return items.map((item, index) => {
      const isExpanded = expandedFolders.includes(item.path);
      const isSelected = selectedFile === item.path;
      const indent = level * 16;

      if (item.type === 'folder') {
        return React.createElement('div', { key: index },
          React.createElement('div', {
            className: `flex items-center px-3 py-1.5 cursor-pointer hover:bg-white/5 rounded-lg mx-1 transition-all ${isSelected ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-300'}`,
            style: { paddingLeft: `${indent + 12}px` },
            onClick: () => toggleFolder(item.path),
            onContextMenu: (e) => handleContextMenu(e, item),
            draggable: true,
            onDragStart: (e) => handleDragStart(e, item),
            onDragOver: handleDragOver,
            onDrop: (e) => handleDrop(e, item.path)
          },
            React.createElement('span', { className: 'mr-2 text-cyan-400' }, isExpanded ? '▼' : '▶'),
            React.createElement('span', { className: 'mr-2' }, '📁'),
            React.createElement('span', { className: 'font-medium text-sm' }, item.name)
          ),
          isExpanded && item.children && React.createElement('div', { className: 'mt-0.5' }, renderTree(item.children, level + 1))
        );
      }

      return React.createElement('div', {
        key: index,
        className: `flex items-center px-3 py-1.5 mx-1 cursor-pointer rounded-lg transition-all text-sm ${isSelected ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400' : 'text-gray-300 hover:bg-white/5'}`,
        style: { paddingLeft: `${indent + 28}px` },
        onClick: () => handleFileClick(item),
        onContextMenu: (e) => handleContextMenu(e, item),
        draggable: true,
        onDragStart: (e) => handleDragStart(e, item)
      },
        React.createElement('span', { className: 'mr-2 text-blue-400' }, '📄'),
        React.createElement('span', {}, item.name)
      );
    });
  };

  return React.createElement('div', {
    className: 'h-full w-72 bg-[#0a0f1e] border-r border-white/10 flex flex-col text-white overflow-hidden'
  },
    React.createElement('div', { className: 'px-4 py-3 border-b border-white/10 flex items-center justify-between bg-white/5' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'w-2 h-2 rounded-full bg-cyan-400 animate-pulse' }),
        React.createElement('span', { className: 'font-semibold tracking-wide text-sm' }, 'FILE EXPLORER')
      ),
      React.createElement('button', {
        onClick: () => createNewFile('', 'file'),
        className: 'text-cyan-400 hover:text-white transition-colors px-2 py-0.5 text-lg leading-none'
      }, '+')
    ),
    React.createElement('div', {
      className: 'flex-1 overflow-y-auto py-2 text-sm custom-scrollbar',
      onClick: closeContextMenu
    }, renderTree(files)),
    contextMenu && React.createElement('div', {
      className: 'fixed bg-[#111827] border border-white/20 rounded-xl shadow-2xl py-1.5 z-50 text-sm min-w-[160px]',
      style: { top: contextMenu.y, left: contextMenu.x }
    },
      React.createElement('div', {
        onClick: () => createNewFile(contextMenu.item.path, 'file'),
        className: 'px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center gap-2'
      }, 'New File'),
      React.createElement('div', {
        onClick: () => createNewFile(contextMenu.item.path, 'folder'),
        className: 'px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center gap-2'
      }, 'New Folder'),
      React.createElement('div', { className: 'h-px bg-white/10 my-1 mx-2' }),
      React.createElement('div', {
        onClick: () => deleteItem(contextMenu.item),
        className: 'px-4 py-2 hover:bg-red-500/20 text-red-400 cursor-pointer flex items-center gap-2'
      }, 'Delete')
    )
  );
}

module.exports = FileExplorer;