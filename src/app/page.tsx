
"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';

const MAX_ENTROPY_POOL_SIZE = 4096;
const QUALITY_THRESHOLD = 5.0;

const calculateStandardDeviation = (array: Uint8Array): number => {
  if (array.length === 0) return 0;
  const n = array.length;
  const mean = array.reduce((a, b) => a + b) / n;
  const variance = array.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
};

export default function Home() {
  const [isReady, setIsReady] = useState(false);
  const [randomNumber, setRandomNumber] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entropyLevel, setEntropyLevel] = useState(0);
  const [audioQuality, setAudioQuality] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const entropyPoolRef = useRef<number[]>([]);

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
    setIsReady(false);
  }, []);

  const gatherEntropy = useCallback(() => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);

      const quality = calculateStandardDeviation(dataArray);
      setAudioQuality(quality);

      if (quality > QUALITY_THRESHOLD) {
        if (entropyPoolRef.current.length < MAX_ENTROPY_POOL_SIZE) {
          entropyPoolRef.current.push(...Array.from(dataArray));
          if (entropyPoolRef.current.length > MAX_ENTROPY_POOL_SIZE) {
             entropyPoolRef.current.splice(MAX_ENTROPY_POOL_SIZE);
          }
          setEntropyLevel(entropyPoolRef.current.length);
        }
      }
    }
    animationFrameIdRef.current = requestAnimationFrame(gatherEntropy);
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
        
        setIsReady(true);
        animationFrameIdRef.current = requestAnimationFrame(gatherEntropy);
      } else {
        setError("Audio capture is not supported in this browser.");
      }
    } catch (err) {
      console.error("Error accessing microphone:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Microphone access was denied. Please allow microphone access in your browser settings to generate random numbers.");
      } else {
        setError("Could not access microphone. Please ensure it is connected and configured correctly.");
      }
    }
  }, [gatherEntropy]);
  
  useEffect(() => {
    startCapture();
    return () => {
      stopCapture();
    };
  }, [startCapture, stopCapture]);

  const handleGenerateNumber = () => {
    if (entropyPoolRef.current.length < 1024) {
      setError(`Not enough entropy gathered. Need at least 1024 bytes. Current pool size: ${entropyLevel}/${MAX_ENTROPY_POOL_SIZE} bytes.`);
      return;
    }
    setError(null);

    const seed = entropyPoolRef.current.reduce((acc, val) => acc + val, 0);

    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;
    const pseudoRandom = (a * seed + c) % m;
    
    const newRandomNumber = pseudoRandom % 10000;

    setRandomNumber(newRandomNumber);
    setAnimationKey(prev => prev + 1);
    
    entropyPoolRef.current = [];
    setEntropyLevel(0);
  };

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">AudioRando</CardTitle>
          <CardDescription>Generate truly random numbers from ambient noise.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-6 py-10">
          <div 
            key={animationKey} 
            className="text-8xl font-bold font-mono text-primary animate-pop-in text-center"
            style={{fontFeatureSettings: '"tnum"'}}
          >
            {String(randomNumber).padStart(4, '0')}
          </div>
          
          <div className="w-full space-y-4 px-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Entropy Pool</span>
                  <span>{entropyLevel} / {MAX_ENTROPY_POOL_SIZE} bytes</span>
              </div>
              <Progress value={(entropyLevel / MAX_ENTROPY_POOL_SIZE) * 100} className="w-full h-3" />
            </div>

            <div className="flex items-center justify-center space-x-4 text-muted-foreground text-sm">
              <div className="flex items-center space-x-2">
                {isReady ? <Mic className="w-4 h-4 text-primary" /> : <MicOff className="w-4 h-4" />}
                <span>{isReady ? "Gathering..." : "Awaiting mic..."}</span>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4" />
                <span>Quality: {audioQuality.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="w-full mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleGenerateNumber} size="lg" className="w-full text-lg py-6" disabled={!isReady || entropyLevel < 1024}>
            <RefreshCw className="mr-2 h-5 w-5" />
            Generate Number
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
