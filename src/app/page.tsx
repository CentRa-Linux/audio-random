"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, MicOff, Play, Square, AlertCircle } from 'lucide-react';

export default function Home() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [randomNumber, setRandomNumber] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const stopCapture = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsCapturing(false);
  }, []);

  const generateRandomNumber = useCallback(() => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const seed = dataArray.reduce((acc, val) => acc + val, 0);

      const a = 1664525;
      const c = 1013904223;
      const m = 2 ** 32;
      const pseudoRandom = (a * seed + c) % m;
      
      const newRandomNumber = pseudoRandom % 10000;

      setRandomNumber(newRandomNumber);
      setAnimationKey(prev => prev + 1);
    }
    animationFrameIdRef.current = requestAnimationFrame(generateRandomNumber);
  }, []);

  const startCapture = useCallback(async () => {
    setError(null);
    try {
      if (typeof window !== "undefined" && navigator.mediaDevices) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream;
        
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = context;
        
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        
        setIsCapturing(true);
        animationFrameIdRef.current = requestAnimationFrame(generateRandomNumber);
      } else {
        setError("Audio capture is not supported in this browser.");
      }
    } catch (err) {
      console.error("Error accessing microphone:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Microphone access was denied. Please allow microphone access in your browser settings.");
      } else {
        setError("Could not access microphone. Please ensure it is connected and configured correctly.");
      }
    }
  }, [generateRandomNumber]);

  const handleToggleCapture = () => {
    if (isCapturing) {
      stopCapture();
    } else {
      startCapture();
    }
  };

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">AudioRando</CardTitle>
          <CardDescription>Generate random numbers from your microphone's audio.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-8 py-10">
          <div 
            key={animationKey} 
            className="text-8xl font-bold font-mono text-primary animate-pop-in text-center"
            style={{fontFeatureSettings: '"tnum"'}}
          >
            {String(randomNumber).padStart(4, '0')}
          </div>
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            {isCapturing ? <Mic className="w-5 h-5 text-primary" /> : <MicOff className="w-5 h-5" />}
            <span>{isCapturing ? "Status: Listening..." : "Status: Idle"}</span>
          </div>
          {error && (
            <Alert variant="destructive" className="w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleToggleCapture} size="lg" className="w-full text-lg py-6">
            {isCapturing ? <Square className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
            {isCapturing ? 'Stop' : 'Start Generation'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}