/*-----------------俄罗斯方块C语言版1.0 贾澎涛  版权所有  违者必究---------------*/  

#include <stdio.h>  
#include <windows.h>  
#include <stdlib.h>  
#include <time.h>  
#include <conio.h> 
 
//定义全局变量 
int image[20][10];  //游戏面板，记录固定块的面板 
/*
   0 1 2 3    0 1         1 2      1  2      0           2    0 1 2     
0  ■■■■   ■■        ■■     ■ ■     ■          ■   ■■■
1               ■■    ■■       ■ ■     ■■■  ■■■     ■
                       从右向左                    从右向左
*/

static int brickX[7][4]={{0,1,2,3},{0,1,1,2},{2,1,1,0},{1,1,2,2},{0,0,1,2},{2,2,1,0},{0,1,1,2}};
static	int brickY[7][4]={{0,0,0,0},{0,0,1,1},{0,0,1,1},{0,1,0,1},{0,1,1,1},{0,1,1,1},{0,0,1,0}};
/*存放方块的x,y坐标*/
unsigned int x[4];  
unsigned int y[4];

/*10个函数声明*/
void Welcome(void);  /*欢迎界面*/
void Display(int binimage[20][10]);            /* 显示游戏面板函数*/
void GotoXY(int x, int y);  /*输出定位函数*/
void Pause(void);    /*暂停*/
void Block_Random(); /*随机生成一个砖块*/
int move(int offsetX,int offsetY,int binImage[20][10]);  /*左移、右移、下移*/
int rotate( int binImage[20][10]);  /*旋转函数*/
void output( int binImage[20][10]); /*输出到显示面板*/
unsigned int removeFullLines();     /*检查是否有一行填满*/
void copyimage(int destimage[20][10],int sourceimage[20][10]); /*拷贝数组*/

int score=0;  //记录分数
int difficulty;  //难度（tick的时间） 
/*----------------------------------------*/  
int main(void)  
{
	int i,j; 


   int gameOver=0;   //游戏是否结束0,1
   int brickInFlight=0;  //砖块是否处于飞行状态0,1
 //int brickType=0;   //砖块类别
 //  unsigned int initOrientation=0; //初始状态
   int notCollide=0;  //砖块是否冲突0,1，为1表示不冲突 
   int arrowKey=0;  //检查用户按键 
 
   int tempimage[20][10];//显示下落过程的面板 
    score=0;
	difficulty=500;
   for(i=0;i<20;i++)  
		for(j=0;j<10;j++)    /*初始化游戏面板*/
			image[i][j]=0;  
    for(i=0;i<20;i++)  
		for(j=0;j<10;j++)    /*初始化临时游戏面板，显示下落过程的面板*/
			tempimage[i][j]=0;  


    Welcome();          /*欢迎界面*/
	Display(image);          /*显示游戏面板*/
	// 开始游戏
   while (!gameOver) //最初为0 
   {//1
        if (!brickInFlight) //最初为0 
		{//2
            // 没有砖块落下时，需要新建一个砖块.
            // 新建砖块需要随机指定砖块的形状和初始状态.
			copyimage(tempimage,image);
            Block_Random();//生成一个新方块 
            notCollide = move(10/2, 0,image); //将方块放在顶部面板中央，检查是否冲突
            if (notCollide)  //不冲突 
			{ //3
                brickInFlight = 1;  //方块处于飞行状态 
                output(tempimage); 
                Display(tempimage);  // 显示image
            }//3结束 
            else 
			{ //4-与3配对 
                // 新建砖块同游戏面板的顶部有冲突，表明面板剩余空间已经放不下新砖块。
				//游戏结束
                gameOver = 1;
                brickInFlight = 0;
            }//4结束-与3配对 
        }//2结束 
        //if (brickInFlight) 
		else
		{	//5-与2配对 
            // 当前有砖块正在下落，因此需要检测用户的按键
            copyimage(tempimage,image);
			if(kbhit())/*Checks the console for keyboard input*/
			{  //6
			    //检测是否有键按下
                arrowKey = getch();  // 检查用户输入
                if (arrowKey == 'd') /*右移*/
					notCollide=move(1, 0,image);
			    else if (arrowKey == 'a') /*左移*/				
					notCollide=move(-1, 0,image);					
				else if (arrowKey == 'w') /*旋转*/				
                    notCollide=rotate(image);			
                else if (arrowKey == 's')  //一键加速下落
				{  //7 
					notCollide=move(0, 1,image);
					while(notCollide) 
					{ //8
						notCollide=move(0, 1,image);
						if (notCollide) 
						{//9
							output(tempimage);
							Display(tempimage);
						}	//9结束					
						copyimage(tempimage,image);						
					}//8结束
				}//7结束                     
				else if (arrowKey == 'p') /*暂停*/
					Pause();
			}//6结束

            // 砖块靠重力下落.不需要按任何键 
			Sleep(difficulty);//短暂休眠500毫秒（半秒）后让砖块下落一格 
            notCollide=move(0, 1,image);
            if (notCollide) 
			{//10
                output(tempimage); 
                Display(tempimage);
            }//10结束
            else 
			{//11-与10配对 
                // 有冲突，砖块落在底部或已固定的砖块上，不再下落.
                brickInFlight = 0;//方块固定 
                // Add this brick permanently to the bin.
	            output(image);
                Display(tempimage);
                // 检查是否需要消行
				switch (removeFullLines())  //计分方式，根据消除的行数计分。这里还可以实现更复杂的计分方式
				{
					case 1:score++;break;  
					case 2:score+=3;break;  
					case 3:score+=5;break;  
					case 4:score+=8;break;  
				}  
                
				switch(score/100)   //等级确定
				{
					case 0:difficulty=500;break;  
					case 1:difficulty=200;break;  
					case 2:difficulty=170;break;  
					case 3:difficulty=150;break;  
					case 4:difficulty=120;break;  
					case 5:difficulty=100;break;  
					case 6:difficulty=70;break;  
					case 7:difficulty=50;break;  
					case 8:difficulty=20;break;  
					case 9:difficulty=0;break;  //
				}  
                // 检查消行后，更新外部图像面板
                copyimage(tempimage,image);
            }//11else结束 
            Display(tempimage);
        }//5else结束 
    }//1 while结束 
   
   GotoXY(1,24);
   printf("Game Over");
   getch();
   return 0;
}  
/*----------------------------------------*/  
void Display(int binimage[20][10])  
{
	int i,j;  
	GotoXY(1,1);  
	for(i=0;i<20;i++)  
	{
		printf("■");  
		for(j=0;j<10;j++)  
		{
			switch(binimage[i][j])  
			{
			case 0:printf("  ");break;  //此处为2个空格 
			case 1:printf("□");break;  
			}
		}  
		printf("■\n");}  
	for(i=0;i<12;i++)  
		printf("■");  
	GotoXY(1,22); printf("SCORE:%d",score);  
	GotoXY(1,23); printf("LEVEL=%d",score/100);  
}

/*----------------------------------------*/  
void GotoXY(int x, int y) 
{  
	COORD c;  
	c.X = x-1;  
	c.Y = y-1;  
	SetConsoleCursorPosition (GetStdHandle(STD_OUTPUT_HANDLE), c);  
}  
/*----------------------------------------*/  
void Block_Random()  
{  
    int k,i;
    k = (rand() % 7);//伪随机 ， 
	for(i=0;i<4;i++){
		x[i]=brickX[k][i];
		y[i]=brickY[k][i];
	}
}  
/*----------------------------------------*/  

void Welcome(void)  
{  
	printf("                                                                            \n");  
	printf("                                                                            \n");  
	printf("                                                                            \n");  
	printf("■■■■■■■                                      ■■■                  \n");  
	printf("■■■■■■■                ■■■                ■■■                  \n");  
	printf("    ■■■                    ■■■                                        \n");  
	printf("    ■■■      ■■■■■    ■■■■  ■■■  ■  ■■■    ■■■■■    \n");  
	printf("    ■■■    ■■■■■■■  ■■■■  ■■■■■  ■■■  ■■■■■■■  \n");  
	printf("    ■■■    ■■■  ■■■  ■■■    ■■■■■  ■■■  ■■■  ■■■  \n");  
	printf("    ■■■    ■■■■■■■  ■■■    ■■■      ■■■  ■■■          \n");  
	printf("    ■■■    ■■■■■■■  ■■■    ■■■      ■■■    ■■■■      \n");  
	printf("    ■■■    ■■■          ■■■    ■■■      ■■■      ■■■■■  \n");  
	printf("    ■■■    ■■■  ■■■  ■■■    ■■■      ■■■          ■■■  \n");  
	printf("    ■■■    ■■■  ■■■  ■■■    ■■■      ■■■  ■■■  ■■■  \n");  
	printf("    ■■■    ■■■■■■■  ■■■■  ■■■      ■■■  ■■■■■■■  \n");  
	printf("    ■■■      ■■■■■    ■■■■  ■■■      ■■■    ■■■■■    \n");  
	printf("                                                                            \n");  
	printf("                                                                            \n");  
	printf("                                                                            \n");  
	
	printf("【C语言俄罗斯方块】V0.13b build080906\n");  
	printf("[旋转：W/8 下落：X/2 左移：A/4 右移：D/6 瞬间下落：S/5 暂停：P 退出：Q]\n");  
	printf("*平均每提高100分 速度会加快一个级别\n");  
	printf("*瞬间下落：S/5 为快速下落 按下后直接落到底部\n");  
	
	system("pause");  
	system("cls");  
}  


/*----------------------------------------*/  
void Pause(void)  
{
	char c;  
	GotoXY(1,23);printf("Pause! ");  
	do  
	{ c=getch(); }  
	while(c!='p');  
}  
int move(int offsetX,int offsetY,int binImage[20][10])
{
	int i;
	int X[4],Y[4];
	for(i=0;i<4;i++)//针对每一个小方格的移动
	{
		X[i]=x[i]+offsetX;
		Y[i]=y[i]+offsetY;
		if(X[i]<0||X[i]>=10||Y[i]<0||Y[i]>=20)  //判断是否能够移动成功
			return 0;
		if(binImage[Y[i]][X[i]]!=0)//有冲突 
			return 0;
	}
	for(i=0;i<4;i++)
	{
		x[i]=X[i];
		y[i]=Y[i];
	}
  	return 1;
}
int rotate( int binImage[20][10])
{
	int i;
	int xt[4],yt[4];
	for(i=0;i<4;i++){
		//进行顺时针90度坐标变换
		xt[i]=y[i]+x[1]-y[1];
		yt[i]=x[1]+y[1]-x[i];
		if(xt[i]<0||xt[i]>=10||yt[i]<0||yt[i]>=20)
			return 0;
		if(binImage[yt[i]][xt[i]]!=0)
			return 0;
	}
	for(i=0;i<4;i++)
	{
		x[i]=xt[i];
		y[i]=yt[i];
	}
	return 1;
}
void output( int binImage[20][10])
{
    int i;   
	for(i=0;i<4;i++)
		  binImage[y[i]][x[i]]=1;//可设置为一个颜色值 
   
}
unsigned int removeFullLines()
{
	unsigned int flag,EmptyLine=0;
    unsigned int i,j,m;
	for (i=0; i<20; i++) 
	{
		flag=0;
		for (j=0; j<10; j++) 
		{
			if (image[i][j]==0 )
			{
				flag=1;
				break; 
			}
			
		}
        //一行完全被填满
		if(flag==0)  
		{
			for(m=i; m>0; m--)  //如果一行完全被填满，删除该行
            	for (j=0; j<10; j++) 
				   image[m][j]=image[m-1][j];
            for (j=0; j<10; j++)  
			   image[0][j]=0;  //第一行为0
		    EmptyLine++;  //Record the number of rows that were emptied
			i--;
		}
	}
     return EmptyLine;   
}
void copyimage(int destimage[20][10],int sourceimage[20][10])
{   
	int i,j;
	for(i=0;i<20;i++)  
		for(j=0;j<10;j++)
            destimage[i][j]=sourceimage[i][j];
}
