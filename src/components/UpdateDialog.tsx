// src/components/UpdateDialog.tsx

import React, { useState } from 'react';
import type { UpdateDialogProps } from '../types/updater';

/**
 * Dialog per notificare all'utente che è disponibile un aggiornamento
 */
export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  open,
  updateInfo,
  onUpdate,
  onIgnore,
  onClose,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!open) return null;

  const handleUpdate = async () => {
    setIsProcessing(true);
    try {
      onUpdate();
    } catch (error) {
      console.error('Update failed:', error);
      setIsProcessing(false);
    }
  };

  const handleIgnore = () => {
    onIgnore();
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const parseChangelog = (changelog: string): string[] => {
    return changelog
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^[#\-\*\s]+/, '').trim())
      .filter(line => line && !line.startsWith('!['));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">Aggiornamento Disponibile</h2>
              <p className="text-blue-100 text-sm">AirShare {updateInfo.newVersion}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-96">
          {/* Version info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600 text-sm">Versione attuale:</span>
              <span className="font-mono text-sm bg-gray-200 px-2 py-1 rounded">
                {updateInfo.currentVersion}
              </span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600 text-sm">Nuova versione:</span>
              <span className="font-mono text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                {updateInfo.newVersion}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Dimensione:</span>
              <span className="text-sm">{formatFileSize(updateInfo.downloadAsset.size)}</span>
            </div>
          </div>

          {/* Release info */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {updateInfo.releaseName}
            </h3>
            <p className="text-gray-600 text-sm mb-2">
              Pubblicata il {formatDate(updateInfo.publishedAt)}
            </p>
            {updateInfo.isPrerelease && (
              <div className="flex items-center text-orange-600 text-sm mb-3">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Versione beta
              </div>
            )}
          </div>

          {/* Changelog */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-800 mb-2">Novità in questa versione:</h4>
            <div className="bg-gray-50 border-l-4 border-blue-500 p-3 rounded-r">
              <div className="text-sm text-gray-700 space-y-1">
                {parseChangelog(updateInfo.changelog).slice(0, 8).map((item, index) => (
                  <div key={index} className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">•</span>
                    <span>{item}</span>
                  </div>
                ))}
                {parseChangelog(updateInfo.changelog).length > 8 && (
                  <div className="text-gray-500 italic text-xs mt-2">
                    ... e altro ancora
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={handleIgnore}
              disabled={isProcessing}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ignora
            </button>
            <button
              onClick={handleUpdate}
              disabled={isProcessing}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Aggiornamento...
                </>
              ) : (
                'Aggiorna Ora'
              )}
            </button>
          </div>

          {/* Additional info */}
          <div className="mt-4 text-xs text-gray-500 text-center">
            L'applicazione si riavvierà automaticamente dopo l'aggiornamento
          </div>
        </div>
      </div>
    </div>
  );
};