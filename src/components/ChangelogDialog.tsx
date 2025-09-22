// src/components/ChangelogDialog.tsx

import React, { useState, useEffect } from 'react';
import type { ChangelogDialogProps } from '../types/updater';

/**
 * Dialog per mostrare il changelog dopo un aggiornamento
 */
export const ChangelogDialog: React.FC<ChangelogDialogProps> = ({
  open,
  changelog,
  onClose,
}) => {
  const [isClosing, setIsClosing] = useState(false);

  // Effetto per prevenire chiusura accidentale nei primi 3 secondi
  const [canClose, setCanClose] = useState(false);
  useEffect(() => {
    if (open) {
      setCanClose(false);
      const timer = setTimeout(() => setCanClose(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    if (!canClose) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 150);
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const parseChangelog = (changelogText: string) => {
    const sections: { title: string; items: string[]; emoji: string }[] = [];
    const lines = changelogText.split('\n').filter(line => line.trim());

    let currentSection = { title: 'Generale', items: [] as string[], emoji: '✨' };
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip badges and empty lines
      if (!trimmedLine || trimmedLine.startsWith('![') || trimmedLine.startsWith('---')) {
        continue;
      }

      // Check for section headers
      if (trimmedLine.startsWith('##')) {
        // Salva sezione precedente se ha elementi
        if (currentSection.items.length > 0) {
          sections.push({ ...currentSection });
        }
        
        // Nuova sezione
        const sectionTitle = trimmedLine.replace(/^#+\s*/, '').replace(/What's New in v[\d.]+/, 'Novità');
        let emoji = '✨';
        
        if (sectionTitle.toLowerCase().includes('fix') || sectionTitle.toLowerCase().includes('bug')) {
          emoji = '🐛';
        } else if (sectionTitle.toLowerCase().includes('feature') || sectionTitle.toLowerCase().includes('nuovo')) {
          emoji = '🚀';
        } else if (sectionTitle.toLowerCase().includes('improvement') || sectionTitle.toLowerCase().includes('miglioramento')) {
          emoji = '⚡';
        } else if (sectionTitle.toLowerCase().includes('security') || sectionTitle.toLowerCase().includes('sicurezza')) {
          emoji = '🔒';
        }
        
        currentSection = { title: sectionTitle, items: [], emoji };
      } 
      // Check for list items
      else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*') || trimmedLine.startsWith('•')) {
        const item = trimmedLine.replace(/^[\-\*\•]\s*/, '').replace(/^\*\*([^*]+)\*\*/, '$1');
        if (item) {
          currentSection.items.push(item);
        }
      }
      // Regular text
      else if (!trimmedLine.startsWith('#') && trimmedLine.length > 10) {
        currentSection.items.push(trimmedLine);
      }
    }

    // Aggiungi ultima sezione
    if (currentSection.items.length > 0) {
      sections.push(currentSection);
    }

    return sections.length > 0 ? sections : [{ 
      title: 'Novità', 
      items: ['Aggiornamento completato con successo!', 'Controlla il repository per i dettagli completi.'], 
      emoji: '✨' 
    }];
  };

  const sections = parseChangelog(changelog.changelog);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden transform transition-all duration-150 ${
        isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}>
        
        {/* Header con celebrazione */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10">
            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
            </svg>
          </div>
          
          <div className="relative">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎉</span>
              </div>
              <div>
                <h2 className="text-xl font-bold">Aggiornamento Completato!</h2>
                <p className="text-green-100 text-sm">Benvenuto in AirShare {changelog.version}</p>
              </div>
            </div>
            
            <p className="text-green-100 text-sm">
              Aggiornato il {formatDate(changelog.publishedAt)}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="border-l-4 border-gray-200 pl-4">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <span className="mr-2 text-lg">{section.emoji}</span>
                  {section.title}
                </h3>
                
                <div className="space-y-2">
                  {section.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="flex items-start">
                      <span className="text-green-500 mr-3 mt-1 flex-shrink-0">•</span>
                      <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Messaggio di ringraziamento */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-blue-500 mr-2 mt-0.5">💡</span>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Grazie per aver aggiornato AirShare!</p>
                <p>Se riscontri problemi o hai suggerimenti, non esitare a contattarci su GitHub.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer con azione */}
        <div className="p-6 bg-gray-50 border-t">
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs text-gray-500">
              {canClose ? 'Clicca per chiudere' : `Attendi ${3 - Math.floor((Date.now() % 3000) / 1000)} secondi...`}
            </div>
            <div className="text-xs text-gray-400">
              v{changelog.version}
            </div>
          </div>
          
          <button
            onClick={handleClose}
            disabled={!canClose}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
              canClose
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {canClose ? 'Perfetto, iniziamo!' : 'Caricamento...'}
          </button>
          
          {!canClose && (
            <div className="w-full bg-gray-200 rounded-full h-1 mt-2 overflow-hidden">
              <div 
                className="bg-green-600 h-1 rounded-full transition-all duration-100"
                style={{ width: `${((Date.now() % 3000) / 3000) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};