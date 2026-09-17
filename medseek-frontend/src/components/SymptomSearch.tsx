"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { autocompleteSymptoms, AutocompleteItem } from "@/lib/api";

interface SymptomSearchProps {
  onSearch: (symptoms: string[]) => void;
  onSymptomsChange?: (symptoms: string[]) => void;
  isLoading?: boolean;
}

export default function SymptomSearch({ onSearch, onSymptomsChange, isLoading = false }: SymptomSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Autocomplete fetch with debounce ────────────────────────

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    try {
      const result = await autocompleteSymptoms(query);
      // Filter out already-selected symptoms
      const filtered = result.data.filter(
        (item) => !selectedSymptoms.includes(item.name)
      );
      setSuggestions(filtered);
      setShowDropdown(filtered.length > 0);
      setHighlightedIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, [selectedSymptoms]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Debounced autocomplete
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  // ─── Selection handlers ──────────────────────────────────────

  const addSymptom = (name: string) => {
    if (!selectedSymptoms.includes(name)) {
      const newSymptoms = [...selectedSymptoms, name];
      setSelectedSymptoms(newSymptoms);
      if (onSymptomsChange) onSymptomsChange(newSymptoms);
    }
    setInputValue("");
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeSymptom = (name: string) => {
    const newSymptoms = selectedSymptoms.filter((s) => s !== name);
    setSelectedSymptoms(newSymptoms);
    if (onSymptomsChange) onSymptomsChange(newSymptoms);
  };

  // ─── Keyboard navigation ────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        addSymptom(suggestions[highlightedIndex].name);
      } else if (selectedSymptoms.length > 0) {
        handleSearch();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    } else if (
      e.key === "Backspace" &&
      inputValue === "" &&
      selectedSymptoms.length > 0
    ) {
      removeSymptom(selectedSymptoms[selectedSymptoms.length - 1]);
    }
  };

  // ─── Search submit ───────────────────────────────────────────

  const handleSearch = () => {
    if (selectedSymptoms.length > 0) {
      onSearch(selectedSymptoms);
    }
  };

  // ─── Click outside to close dropdown ─────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Cleanup timer ───────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Search input container */}
      <div className="relative group">
        <div className="flex items-center flex-wrap gap-2 sm:gap-3 rounded-2xl sm:rounded-full border border-blue-300 bg-white/70 glass px-3.5 py-3 sm:px-6 sm:py-4 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/20 transition-all duration-500 shadow-[0_0_20px_rgba(59,130,246,0.05)] hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] group-focus-within:shadow-[0_0_30px_rgba(59,130,246,0.2)]">
          {/* Search icon */}
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 shrink-0 transition-colors duration-300 group-focus-within:text-blue-600 group-focus-within:animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          {/* Selected symptom chips */}
          {selectedSymptoms.map((symptom) => (
            <span
              key={symptom}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 shadow-xs capitalize transition-all hover:bg-blue-100/70"
            >
              {symptom.replace(/_/g, " ")}
              <button
                type="button"
                onClick={() => removeSymptom(symptom)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200/80 hover:text-blue-900 transition-colors"
                aria-label={`Remove ${symptom}`}
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          ))}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            placeholder={
              selectedSymptoms.length > 0
                ? "Add more..."
                : "Type symptoms — headache, fever, fatigue..."
            }
            className="flex-1 min-w-[130px] sm:min-w-[200px] bg-transparent text-slate-800 placeholder:text-slate-400 outline-none text-base font-normal tracking-normal py-1"
            autoComplete="off"
            id="symptom-search-input"
          />

          {/* Search button */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={selectedSymptoms.length === 0 || isLoading}
            className="w-full sm:w-auto shrink-0 px-5 sm:px-6 py-2.5 rounded-xl sm:rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:shadow-md hover:shadow-blue-600/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none flex items-center justify-center relative overflow-hidden"
            id="search-button"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching
              </span>
            ) : (
              "Analyze"
            )}
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-2 sm:mt-3 bg-white/95 border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden z-50 max-h-60 sm:max-h-80 overflow-y-auto animate-slide-up backdrop-blur-xl"
            role="listbox"
            id="symptom-suggestions"
          >
            {suggestions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => addSymptom(item.name)}
                className={`w-full text-left px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between transition-colors border-b border-slate-100 last:border-0 ${
                  index === highlightedIndex
                    ? "bg-blue-50 text-blue-900 border-l-4 border-l-blue-600"
                    : "hover:bg-slate-50 text-slate-800 border-l-4 border-l-transparent"
                }`}
              >
                <div>
                  <span className="text-sm font-medium capitalize">
                    {item.name.replace(/_/g, " ")}
                  </span>
                  {item.match_source === "synonym" && (
                    <span className="ml-2 text-xs text-blue-600 font-normal">
                      (matched: <span className="font-medium text-blue-700">{item.matched_text}</span>)
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-500 shrink-0 ml-2">
                  {Math.round(item.similarity * 100)}%
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hint text */}
      {selectedSymptoms.length === 0 && (
        <p className="mt-4 sm:mt-6 text-center text-xs sm:text-sm text-slate-500 font-light tracking-wide animate-fade-in delay-200">
          Enter one or more symptoms to find possible conditions.
          <br />
          <span className="text-xs opacity-80 mt-1.5 inline-block">
            Try: <button type="button" onClick={() => addSymptom("headache")} className="text-blue-600 hover:text-slate-600 hover:underline transition-colors px-1">headache</button>{", "}
            <button type="button" onClick={() => addSymptom("fever")} className="text-blue-600 hover:text-slate-600 hover:underline transition-colors px-1">fever</button>{", "}
            <button type="button" onClick={() => addSymptom("fatigue")} className="text-blue-600 hover:text-slate-600 hover:underline transition-colors px-1">fatigue</button>
          </span>
        </p>
      )}
    </div>
  );
}
