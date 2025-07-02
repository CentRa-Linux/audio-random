
"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, RefreshCw, AlertCircle, TrendingUp, Copy, KeyRound, Hash, Dices } from 'lucide-react';

const MAX_ENTROPY_POOL_SIZE = 262144;
const QUALITY_THRESHOLD = 25.0;

const calculateStandardDeviation = (array: Uint8Array): number => {
  if (array.length === 0) return 0;
  const n = array.length;
  const mean = array.reduce((a, b) => a + b) / n;
  const variance = array.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
};

export default function Home() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entropyLevel, setEntropyLevel] = useState(0);
  const [audioQuality, setAudioQuality] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);

  const [outputType, setOutputType] = useState('password');
  const [outputSize, setOutputSize] = useState(16);
  const [generatedOutput, setGeneratedOutput] = useState<string>('---');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  // State for Number generation
  const [numRolls, setNumRolls] = useState(1);
  const [minPerRoll, setMinPerRoll] = useState(1);
  const [maxPerRoll, setMaxPerRoll] = useState(6);

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
          const whitenedBytes = [];
          for (let i = 0; i < dataArray.length; i += 2) {
            if (i + 1 < dataArray.length) {
                const byte1 = dataArray[i];
                const byte2 = dataArray[i + 1];
                if (byte1 !== byte2 && byte1 !== 0) {
                    whitenedBytes.push(byte1);
                }
            }
          }

          if (whitenedBytes.length > 0) {
            entropyPoolRef.current.push(...whitenedBytes);
            if (entropyPoolRef.current.length > MAX_ENTROPY_POOL_SIZE) {
               entropyPoolRef.current.splice(MAX_ENTROPY_POOL_SIZE);
            }
            setEntropyLevel(entropyPoolRef.current.length);
          }
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
  
  const handleTemplateClick = (template: string) => {
    const [countStr, sidesStr] = template.split('d');
    const count = parseInt(countStr, 10);
    const sides = parseInt(sidesStr, 10);
    
    setNumRolls(count);
    setMinPerRoll(1);
    setMaxPerRoll(sides);
  };

  const handleGenerate = async () => {
    const requiredEntropy = outputType === 'number' 
      ? numRolls * 8 // 8 bytes (64 bits) per roll should be sufficient
      : Math.max(256, outputSize * 4);
    
    if (entropyPoolRef.current.length < requiredEntropy) {
      setError(`Not enough entropy. Need ${requiredEntropy} bytes, have ${entropyLevel}. Make some noise!`);
      return;
    }
    setError(null);
    setIsGenerating(true);

    try {
      let result: string;
      
      // Use a different logic branch for number generation
      if (outputType === 'number') {
        if (minPerRoll >= maxPerRoll) {
            setError("Min value must be less than max value.");
            setIsGenerating(false);
            return;
        }

        const rolls: bigint[] = [];
        let total = 0n;
        const range = BigInt(maxPerRoll) - BigInt(minPerRoll) + 1n;

        for (let i = 0; i < numRolls; i++) {
            // Take 8 bytes for each roll for high precision
            const entropyChunk = entropyPoolRef.current.splice(0, 8);
            
            let randomBigInt = 0n;
            for (const byte of entropyChunk) {
              randomBigInt = (randomBigInt << 8n) + BigInt(byte);
            }
            
            const roll = BigInt(minPerRoll) + (randomBigInt % range);
            rolls.push(roll);
            total += roll;
        }
        
        result = numRolls > 1 ? `${total} (${rolls.join(', ')})` : total.toString();
        setEntropyLevel(entropyPoolRef.current.length);

      } else {
        // Existing logic for password and hex
        const entropyChunk = entropyPoolRef.current.splice(0, requiredEntropy);
        setEntropyLevel(entropyPoolRef.current.length);

        const finalBytes: number[] = [];
        let counter = 0;
        const encoder = new TextEncoder();

        while (finalBytes.length < outputSize) {
          const counterBytes = encoder.encode(counter.toString());
          const dataToHash = new Uint8Array([...entropyChunk, ...counterBytes]);
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataToHash);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          finalBytes.push(...hashArray);
          counter++;
        }
        
        const randomBytes = finalBytes.slice(0, outputSize);

        switch(outputType) {
          case 'password':
            const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:',.<>?/";
            result = Array.from({ length: outputSize }, (_, i) => charset[randomBytes[i] % charset.length]).join('');
            break;
          case 'hex':
            result = randomBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
            break;
          default:
            result = '---'; // Should not happen
            break;
        }
      }
      
      setGeneratedOutput(result);
      setAnimationKey(prev => prev + 1);
    } catch (e) {
      console.error("Error during generation:", e);
      setError("Failed to generate random data due to an unexpected error.");
    } finally {
      setIsGenerating(false);
    }
  };
  
  const copyToClipboard = () => {
    if (generatedOutput === '---') return;
    navigator.clipboard.writeText(String(generatedOutput)).then(() => {
        toast({
            title: "Copied to clipboard!",
            description: "The generated output has been copied.",
        });
    }, (err) => {
        toast({
            variant: "destructive",
            title: "Failed to copy",
            description: "Could not copy text to clipboard.",
        });
        console.error('Could not copy text: ', err);
    });
  };

  const getLengthLabel = () => {
    switch(outputType) {
      case 'password': return '文字数';
      case 'hex': return '桁数';
      default: return '';
    }
  }

  const getDisplayLength = () => {
     switch(outputType) {
      case 'hex': return outputSize * 2;
      case 'password': return outputSize;
      default: return 0;
    }
  }
  
  const requiredEntropy = outputType === 'number' 
      ? numRolls * 8
      : Math.max(256, outputSize * 4);
      
  const diceTemplates = ['1d3', '1d6', '1d10', '1d20', '1d100', '2d6', '3d6'];

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">WORDの騒音で乱数作るくん</CardTitle>
          <CardDescription>Generate truly random numbers, passwords, and more from ambient noise.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-6">
          <div className="w-full px-4">
            <div className="relative mb-6 bg-muted rounded-lg p-4 group min-h-[100px] flex items-center justify-center">
              <pre
                key={animationKey} 
                className="text-xl font-mono text-primary break-all whitespace-pre-wrap animate-pop-in text-center select-all"
                style={{fontFeatureSettings: '"tnum"'}}
              >
                {generatedOutput}
              </pre>
              <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={copyToClipboard}
                  disabled={generatedOutput === '---'}
              >
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">Copy to clipboard</span>
              </Button>
            </div>
          
            <div className="w-full space-y-6">
              <Tabs value={outputType} onValueChange={setOutputType} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="number"><Dices className="mr-2 h-4 w-4"/>Number</TabsTrigger>
                  <TabsTrigger value="password"><KeyRound className="mr-2 h-4 w-4"/>Password</TabsTrigger>
                  <TabsTrigger value="hex"><Hash className="mr-2 h-4 w-4"/>Hex</TabsTrigger>
                </TabsList>
              </Tabs>
              
              {outputType === 'number' ? (
                <div className="space-y-4">
                   <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="num-rolls">Rolls</Label>
                            <Input id="num-rolls" type="number" value={numRolls} onChange={e => setNumRolls(Math.max(1, parseInt(e.target.value) || 1))} min="1"/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="min-roll">Min</Label>
                            <Input id="min-roll" type="number" value={minPerRoll} onChange={e => setMinPerRoll(parseInt(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="max-roll">Max</Label>
                            <Input id="max-roll" type="number" value={maxPerRoll} onChange={e => setMaxPerRoll(parseInt(e.target.value) || 0)} />
                        </div>
                   </div>
                   <div className="space-y-2">
                      <Label>Dice Templates</Label>
                      <div className="flex flex-wrap gap-2">
                        {diceTemplates.map(template => (
                          <Button key={template} variant="outline" size="sm" onClick={() => handleTemplateClick(template)}>
                            {template}
                          </Button>
                        ))}
                      </div>
                   </div>
                </div>
              ) : (
                <div className="space-y-2">
                   <div className="flex justify-between items-center text-sm">
                        <Label htmlFor="bytes-slider">{getLengthLabel()}</Label>
                        <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{getDisplayLength()}</span>
                    </div>
                    <Slider
                        id="bytes-slider"
                        value={[outputSize]}
                        onValueChange={(v) => setOutputSize(v[0])}
                        min={4}
                        max={128}
                        step={4}
                    />
                </div>
              )}


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
          <Button onClick={handleGenerate} size="lg" className="w-full text-lg py-6" disabled={!isReady || entropyLevel < requiredEntropy || isGenerating}>
            <RefreshCw className={`mr-2 h-5 w-5 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
