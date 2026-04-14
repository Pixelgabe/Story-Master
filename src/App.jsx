import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Download, Trash2, LayoutGrid, FileType, Settings, ImagePlus } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

const ASPECT_RATIOS = {
  '16:9': 16 / 9,
  '2.39:1': 2.39 / 1,
  '1.85:1': 1.85 / 1,
  '4:3': 4 / 3,
  '1:1': 1 / 1,
  '9:16': 9 / 16
};

function ThumbItem({ item, index, isActive, onSelect, onRemove, formatNumber }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`thumb-item ${isActive ? 'is-active' : ''}`}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        onSelect(item.id);
        listeners?.onPointerDown?.(e);
      }}
    >
      <img src={item.url} alt={`thumb-${index}`} className="thumb-image" />
      <div className="thumb-number">{formatNumber(index)}</div>
      <button 
        className="thumb-delete" 
        onPointerDown={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function App() {
  const [items, setItems] = useState([]);
  const [activeFrameId, setActiveFrameId] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Global Info
  const [projectName, setProjectName] = useState('Storyboard');
  const [globalAspectRatio, setGlobalAspectRatio] = useState('16:9');

  // Image transformations
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);

  // Numbering settings
  const [numberingStart, setNumberingStart] = useState(1);
  const [numberingStyle, setNumberingStyle] = useState('decimal'); // decimal, roman, letter

  // PDF Settings
  const [paperSize, setPaperSize] = useState('letter'); // letter, a4
  const [orientation, setOrientation] = useState('landscape'); // landscape, portrait
  const [gridCols, setGridCols] = useState(3);
  const [gridRows, setGridRows] = useState(3);
  const [showNumbers, setShowNumbers] = useState(true);
  const [showBorders, setShowBorders] = useState(true);

  // Derive active item
  const activeItem = items.find(i => i.id === activeFrameId);
  const currentRatioNum = ASPECT_RATIOS[globalAspectRatio];

  const removeImage = (id) => {
    setItems((prev) => {
      const index = prev.findIndex(i => i.id === id);
      if (index === -1) return prev;
      URL.revokeObjectURL(prev[index].url);
      
      const nextItems = prev.filter(i => i.id !== id);
      
      if (activeFrameId === id) {
        if (nextItems.length > 0) {
          setActiveFrameId(nextItems[Math.max(0, index - 1)].id);
        } else {
          setActiveFrameId(null);
        }
      }
      return nextItems;
    });
  };

  const duplicateImage = (id) => {
    setItems((prev) => {
      const index = prev.findIndex(i => i.id === id);
      if (index === -1) return prev;
      
      const itemToDuplicate = prev[index];
      const duplicatedItem = {
        ...itemToDuplicate,
        id: uuidv4(),
        notes: itemToDuplicate.notes
      };
      
      const newItems = [...prev];
      newItems.splice(index + 1, 0, duplicatedItem);
      return newItems;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeFrameId || items.length === 0) return;

      const currentIndex = items.findIndex(i => i.id === activeFrameId);

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (currentIndex > 0) {
            setActiveFrameId(items[currentIndex - 1].id);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < items.length - 1) {
            setActiveFrameId(items[currentIndex + 1].id);
          }
          break;
        case 'Delete':
          e.preventDefault();
          removeImage(activeFrameId);
          break;
        case 'ArrowUp':
          e.preventDefault();
          duplicateImage(activeFrameId);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFrameId, items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id && over) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleGlobalDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleGlobalDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };
  const handleGlobalDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    addFiles(files);
  };
  const handleFileInput = (e) => {
    const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
    addFiles(files);
  };

  const addFiles = (files) => {
    const newItems = files.map((file) => ({
      id: uuidv4(),
      url: URL.createObjectURL(file),
      file,
      notes: ''
    }));
    setItems((prev) => {
      const combined = [...prev, ...newItems];
      if (!activeFrameId && combined.length > 0) {
        setActiveFrameId(combined[0].id);
      }
      return combined;
    });
  };

  const toRoman = (num) => {
    const romanNumerals = [
      { value: 1000, numeral: 'M' },
      { value: 900, numeral: 'CM' },
      { value: 500, numeral: 'D' },
      { value: 400, numeral: 'CD' },
      { value: 100, numeral: 'C' },
      { value: 90, numeral: 'XC' },
      { value: 50, numeral: 'L' },
      { value: 40, numeral: 'XL' },
      { value: 10, numeral: 'X' },
      { value: 9, numeral: 'IX' },
      { value: 5, numeral: 'V' },
      { value: 4, numeral: 'IV' },
      { value: 1, numeral: 'I' }
    ];
    let result = '';
    for (const { value, numeral } of romanNumerals) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  };

  const toLetter = (num) => {
    let result = '';
    while (num > 0) {
      num--;
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26);
    }
    return result || 'A';
  };

  const formatNumber = (index) => {
    const num = index + numberingStart;
    switch (numberingStyle) {
      case 'roman':
        return toRoman(num);
      case 'letter':
        return toLetter(num);
      default:
        return num.toString();
    }
  };

  const updateItemNotes = (id, newNotes) => {
    setItems((prev) => prev.map(item => item.id === id ? { ...item, notes: newNotes } : item));
  };

  const generatePDF = async () => {
    if (items.length === 0) return;
    
    const sizeMap = {
      letter: [8.5 * 72, 11 * 72],
      a4: [595.28, 841.89]
    };

    let pWidth = sizeMap[paperSize][0];
    let pHeight = sizeMap[paperSize][1];
    if (orientation === 'landscape') {
      pWidth = sizeMap[paperSize][1];
      pHeight = sizeMap[paperSize][0];
    }

    const doc = new jsPDF({
      orientation: orientation,
      unit: 'pt',
      format: paperSize
    });

    const marginX = 40;
    const marginY = 40;
    const headerHeight = 40;
    const footerHeight = 20;
    const cellSpacing = 20; 

    const gridWidth = pWidth - (marginX * 2);
    const gridHeight = pHeight - marginY - headerHeight - footerHeight - marginY;

    const totalSpacingX = (gridCols - 1) * cellSpacing;
    const totalSpacingY = (gridRows - 1) * cellSpacing;
    
    const cellW = (gridWidth - totalSpacingX) / gridCols;
    const cellH = (gridHeight - totalSpacingY) / gridRows;

    const notesHeight = Math.min(48, cellH * 0.25); 
    const imageBoxH = cellH - notesHeight;
    const imageBoxW = cellW;

    const itemsPerPage = gridCols * gridRows;
    const totalPages = Math.ceil(items.length / itemsPerPage);

    let pageNum = 1;

    const drawHeaderFooter = (pNum) => {
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(projectName, marginX, marginY + 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Page ¹/₂`.replace('¹', pNum).replace('₂', totalPages), pWidth - marginX - 40, pHeight - marginY);
    };

    drawHeaderFooter(pageNum);

    for (let i = 0; i < items.length; i++) {
        if (i > 0 && i % itemsPerPage === 0) {
            doc.addPage();
            pageNum++;
            drawHeaderFooter(pageNum);
        }

        const pageIndex = i % itemsPerPage;
        const col = pageIndex % gridCols;
        const row = Math.floor(pageIndex / gridCols);

        const xPos = marginX + col * (cellW + cellSpacing);
        const yPos = marginY + headerHeight + row * (cellH + cellSpacing);

        let renderW = imageBoxW;
        let renderH = imageBoxH;
        
        const targetRatio = currentRatioNum;
        const cellRatio = imageBoxW / imageBoxH;

        if (targetRatio > cellRatio) {
            renderH = imageBoxW / targetRatio;
        } else {
            renderW = imageBoxH * targetRatio;
        }
        
        const offX = (cellW - renderW) / 2;
        
        await new Promise((resolve) => {
           const img = new Image();
           img.onload = () => {
              doc.addImage(img, 'JPEG', xPos + offX, yPos, renderW, renderH);
              resolve();
           };
           img.src = items[i].url;
        });

        if (showBorders) {
          doc.setDrawColor(50);
          doc.setLineWidth(1);
          doc.rect(xPos + offX, yPos, renderW, renderH);
        }

        if (showNumbers) {
            doc.setFontSize(9);
            doc.setTextColor(50, 50, 50);
            doc.text(`Shot ${formatNumber(i)}`, xPos, yPos - 5);
        }

        if (items[i].notes) {
           doc.setFontSize(9);
           doc.setTextColor(30, 30, 30);
           const lines = doc.splitTextToSize(items[i].notes, cellW);
           doc.text(lines, xPos, yPos + renderH + 12);
        }
    }

    const safeFilename = projectName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'storyboard';
    doc.save(`${safeFilename}.pdf`);
  };

  return (
    <div 
      className="app-layout"
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {isDraggingOver && (
        <div className="dropzone-overlay">
          <div className="dropzone-text">Drop images anywhere to import</div>
        </div>
      )}

      <header className="header">
        <div className="header-title">
          <div className="header-logo">S</div>
          Storyboarder Web
        </div>
      </header>

      <main className="main-content">
        <section className="center-stage">
          <div className="viewer-toolbar" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
            <button 
              className={`btn-icon ${flipHorizontal ? 'active' : ''}`} 
              onClick={() => setFlipHorizontal(!flipHorizontal)}
              title="Flip Horizontal"
              style={{ padding: 4, background: '#333', borderRadius: 4, marginRight: 4 }}
            >
              ⇄
            </button>
            <button 
              className={`btn-icon ${flipVertical ? 'active' : ''}`} 
              onClick={() => setFlipVertical(!flipVertical)}
              title="Flip Vertical"
              style={{ padding: 4, background: '#333', borderRadius: 4 }}
            >
              ⇅
            </button>
          </div>

          <div className="viewer-container">
            {activeItem ? (
              <div 
                className="viewer-frame" 
                style={{ aspectRatio: globalAspectRatio.replace(':', '/') }}
              >
                <img 
                  src={activeItem.url} 
                  alt="Active Frame" 
                  className="viewer-image" 
                  style={{
                    transform: `${flipHorizontal ? 'scaleX(-1)' : ''} ${flipVertical ? 'scaleY(-1)' : ''}`.trim() || 'none'
                  }}
                />
              </div>
            ) : (
              <div className="empty-state">
                <LayoutGrid size={48} opacity={0.3} style={{ marginBottom: 16 }} />
                <h3>No Frames Loaded</h3>
                <p style={{ marginTop: 8, fontSize: '0.9rem' }}>Drag frames into the window to get started.</p>
              </div>
            )}
          </div>

          <div className="thumbnail-strip-container">
            <div className="thumbnail-toolbar">
              <strong>Timeline</strong>
              <span>{items.length} Boards</span>
              <label className="btn-secondary" style={{ marginLeft: 'auto', cursor: 'pointer' }}>
                <ImagePlus size={14} /> Import
                <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFileInput}/>
              </label>
            </div>
            <div className="thumbnail-scroll-area">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={items}
                  strategy={horizontalListSortingStrategy}
                >
                  {items.map((item, index) => (
                    <ThumbItem 
                      key={item.id}
                      item={item}
                      index={index}
                      isActive={item.id === activeFrameId}
                      onSelect={setActiveFrameId}
                      onRemove={removeImage}
                      formatNumber={formatNumber}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </section>

        <aside className="sidebar">
          
          <div className="sidebar-section">
            <div className="sidebar-section-title"><Settings size={14} /> Project Settings</div>
            
            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input 
                type="text" 
                className="text-input" 
                value={projectName} 
                onChange={e => setProjectName(e.target.value)} 
                placeholder="Storyboard"
              />
            </div>
            
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Final Aspect Ratio</label>
              <select 
                className="select-input" 
                value={globalAspectRatio} 
                onChange={e => setGlobalAspectRatio(e.target.value)}
              >
                {Object.keys(ASPECT_RATIOS).map(ratio => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Numbering Style</label>
              <select 
                className="select-input" 
                value={numberingStyle} 
                onChange={e => setNumberingStyle(e.target.value)}
              >
                <option value="decimal">Decimal (1, 2, 3...)</option>
                <option value="roman">Roman (I, II, III...)</option>
                <option value="letter">Letter (A, B, C...)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Starting Number</label>
              <input 
                type="number" 
                className="number-input" 
                value={numberingStart} 
                onChange={e => setNumberingStart(Number(e.target.value))} 
                min="0"
                max="1000"
              />
            </div>
          </div>

          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="sidebar-section-title"><LayoutGrid size={14} /> Frame Settings</div>
            
            {activeItem ? (
              <div className="form-group">
                <label className="form-label">Notes for Shot {formatNumber(items.findIndex(i => i.id === activeItem.id))}</label>
                <textarea 
                  className="textarea-input" 
                  value={activeItem.notes}
                  onChange={(e) => updateItemNotes(activeItem.id, e.target.value)}
                  placeholder="Enter dialogue, action, or camera notes here..."
                />
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Select a frame in the timeline to add notes.</p>
            )}
          </div>

          <div className="sidebar-section" style={{ borderBottom: 'none' }}>
             <div className="sidebar-section-title"><FileType size={14} /> PDF Exporter</div>
            
             <div className="form-group">
              <div className="radio-group">
                <input type="radio" id="paper-letter" className="radio-input" checked={paperSize === 'letter'} onChange={() => setPaperSize('letter')} />
                <label htmlFor="paper-letter" className="radio-label">Letter</label>

                <input type="radio" id="paper-a4" className="radio-input" checked={paperSize === 'a4'} onChange={() => setPaperSize('a4')} />
                <label htmlFor="paper-a4" className="radio-label">A4</label>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 8 }}>
              <div className="radio-group">
                <input type="radio" id="or-land" className="radio-input" checked={orientation === 'landscape'} onChange={() => setOrientation('landscape')} />
                <label htmlFor="or-land" className="radio-label">Landscape</label>

                <input type="radio" id="or-port" className="radio-input" checked={orientation === 'portrait'} onChange={() => setOrientation('portrait')} />
                <label htmlFor="or-port" className="radio-label">Portrait</label>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 8 }}>
              <div className="grid-dim-group">
                <div className="grid-dim-input">
                   <label>Rows</label>
                   <input type="number" min="1" max="10" className="number-input" value={gridRows} onChange={(e) => setGridRows(Number(e.target.value))} />
                </div>
                <span style={{color: 'var(--text-muted)', paddingTop: 16}}>×</span>
                <div className="grid-dim-input">
                   <label>Columns</label>
                   <input type="number" min="1" max="10" className="number-input" value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} />
                </div>
              </div>
            </div>

          </div>

          <div className="sidebar-footer">
            <button className="btn-primary" onClick={generatePDF} disabled={items.length === 0}>
              <Download size={18} />
              Export to PDF
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
