// Arithmetic-model timing on the current Linux CPU. Not Max, Live or M1 DSP usage.
#include "all_model.hpp"
#include <chrono>
#include <iostream>

int main(){
    constexpr double sr=48000,seed=1234567;
    constexpr int warm=96000,frames=960000;
    std::array<double,4096> input{};
    for(size_t n=0;n<input.size();n++)input[n]=.5*std::sin(n*.073);
    for(int scenario=0;scenario<2;scenario++){
        AllEngine e(sr);double sum=0;
        if(scenario==1){
            for(auto* m:{&e.all_motion0,&e.all_motion1,&e.all_motion2,&e.all_motion3,&e.all_motion4,&e.all_motion5}){
                m->hSeed=seed;m->hRate=sr;m->hWait=0;m->hShape=0;
                m->hMaximum=sr*.02;m->hLimit=96000;m->hPeriod=1;
            }
        }
        for(int n=0;n<warm;n++)e.tick(input[n&4095],input[(n+517)&4095],1,seed);
        auto start=std::chrono::steady_clock::now();
        for(int n=0;n<frames;n++){auto y=e.tick(input[n&4095],input[(n+517)&4095],1,seed);sum+=y[0]+y[1];}
        double seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
        std::cout<<"{\"scenario\":\""<<(scenario==0?"normal_random":"forced_frequent_events")
                 <<"\",\"sample_rate\":"<<sr<<",\"frames\":"<<frames<<",\"audio_seconds\":"<<frames/sr
                 <<",\"elapsed_seconds\":"<<seconds<<",\"nanoseconds_per_frame\":"<<seconds*1e9/frames
                 <<",\"checksum\":"<<sum<<"}\n";
    }
}
